import test, { describe } from "node:test"
import assert from "node:assert"
import BoardsDecor, {
  kindOf,
  simBadge,
  columnStatus,
  SIM_QA_LABEL,
  STATUS_ORDER,
  missingColumns,
  STATUS_LABELS,
  isMouse,
} from "./BoardsDecor"
import { opensInPopup } from "./TaskPopup"

const Decor = (BoardsDecor as any)() as { afterDOMLoaded: string; css: string }

// A card row as the bases-page plugin renders it, reduced to what the script reads and writes.
function fakeRow(label: string, value: string) {
  const el = (text: string) => ({ textContent: text, querySelector: () => null })
  const row: any = {
    dataset: {},
    title: "",
    querySelector: (sel: string) =>
      sel === ".bases-board-card-label"
        ? el(label)
        : sel === ".bases-board-card-value"
          ? el(value)
          : null,
  }
  return row
}

// Run the injected script against a document that only has these card rows.
function runDecor(rows: any[]) {
  const listeners: Record<string, () => void> = {}
  const doc: any = {
    querySelectorAll: (sel: string) => (sel === ".bases-board-card-row" ? rows : []),
    querySelector: () => null,
    addEventListener: (name: string, fn: () => void) => (listeners[name] = fn),
  }
  const win: any = { addEventListener: () => {}, matchMedia: () => ({ matches: false }) }
  new Function(
    "document",
    "window",
    "requestAnimationFrame",
    "getComputedStyle",
    Decor.afterDOMLoaded,
  )(
    doc,
    win,
    () => {},
    () => ({}),
  )
  return { rows, rerun: listeners["nav"] }
}

describe("BoardsDecor kind tag (CV-21)", () => {
  test("kindOf trims and lowercases", () => {
    assert.strictEqual(kindOf("  Bug \n"), "bug")
    assert.strictEqual(kindOf("feature"), "feature")
  })

  test("a bug card row is tagged data-kind=bug, other kinds are not bug", () => {
    const bug = fakeRow("Kind", "bug")
    const feature = fakeRow("Kind", "feature")
    const { rerun } = runDecor([bug, feature])
    assert.strictEqual(bug.dataset.prop, "kind")
    assert.strictEqual(bug.dataset.kind, "bug")
    assert.strictEqual(feature.dataset.kind, "feature")
    // re-render after a refresh/spaNavigate: idempotent
    rerun()
    assert.strictEqual(bug.dataset.kind, "bug")
  })

  test("css shows only the bug kind row", () => {
    assert.match(Decor.css, /\[data-prop="kind"\] \{ display: none; \}/)
    assert.match(Decor.css, /\[data-prop="kind"\]\[data-kind="bug"\] \{ display: block; \}/)
  })
})

describe("BoardsDecor sim-qa column (CV-22)", () => {
  test("simBadge shows the [sim] / [device] counts", () => {
    assert.strictEqual(simBadge(2, 1), "[sim] 2 / [device] 1")
    assert.strictEqual(simBadge(0, 0), "[sim] 0 / [device] 0")
  })

  test("columnStatus maps the site label back to the status and lowercases the rest", () => {
    assert.strictEqual(columnStatus(" sim-qa "), "sim-qa")
    assert.strictEqual(columnStatus(SIM_QA_LABEL), "sim-qa")
    assert.strictEqual(columnStatus("QA"), "qa")
    assert.strictEqual(columnStatus("In-Review"), "in-review")
  })

  test("the sim-qa column is relabelled, tagged, and its cards get a count badge; others untouched", async () => {
    const mk = (text: string) => ({ textContent: text })
    const mkCard = (id: string) => {
      const added: any[] = []
      const nameRow: any = { dataset: { prop: "name" }, querySelector: () => null, textContent: id }
      return {
        added,
        querySelector: (sel: string) =>
          sel.includes("boards-simcount")
            ? (added[0] ?? null)
            : sel.includes('data-prop="name"') && sel.includes("bases-board-card-value")
              ? { textContent: id }
              : null,
        appendChild: (n: any) => added.push(n),
        __nameRow: nameRow,
      }
    }
    const simName = mk("sim-qa")
    const qaName = mk("qa")
    const card = mkCard("PR-7")
    const simCol: any = {
      dataset: {},
      querySelector: () => simName,
      querySelectorAll: (sel: string) => (sel.includes("card") ? [card] : []),
    }
    const qaCol: any = { dataset: {}, querySelector: () => qaName, querySelectorAll: () => [] }
    const doc: any = {
      querySelectorAll: (sel: string) => (sel === ".bases-board-column" ? [simCol, qaCol] : []),
      querySelector: () => null,
      createElement: () => ({ className: "", textContent: "" }),
      addEventListener: () => {},
    }
    const fetched: string[] = []
    const realFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async (u: string) => {
      fetched.push(u)
      return { ok: true, json: async () => ({ tasks: [{ id: "PR-7", sim: 2, device: 1 }] }) }
    }
    try {
      new Function(
        "document",
        "window",
        "requestAnimationFrame",
        "getComputedStyle",
        Decor.afterDOMLoaded,
      )(
        doc,
        { addEventListener: () => {}, matchMedia: () => ({ matches: false }) },
        () => {},
        () => ({}),
      )
      await new Promise((r) => setTimeout(r, 10))
    } finally {
      ;(globalThis as any).fetch = realFetch
    }
    assert.strictEqual(simCol.dataset.status, "sim-qa")
    assert.strictEqual(simName.textContent, SIM_QA_LABEL)
    assert.strictEqual(qaCol.dataset.status, "qa")
    // CV-26: every status column shows its site label
    assert.strictEqual(qaName.textContent, STATUS_LABELS.qa)
    assert.deepStrictEqual(fetched, ["/api/sim"])
    assert.strictEqual(card.added.length, 1)
    assert.strictEqual(card.added[0].textContent, "[sim] 2 / [device] 1")
  })

  test("no sim-qa column means no /api/sim call", async () => {
    const qaName = { textContent: "qa" }
    const col: any = { dataset: {}, querySelector: () => qaName, querySelectorAll: () => [] }
    const doc: any = {
      querySelectorAll: (sel: string) => (sel === ".bases-board-column" ? [col] : []),
      querySelector: () => null,
      addEventListener: () => {},
    }
    let calls = 0
    const realFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = async () => (
      calls++,
      { ok: true, json: async () => ({ tasks: [] }) }
    )
    try {
      new Function(
        "document",
        "window",
        "requestAnimationFrame",
        "getComputedStyle",
        Decor.afterDOMLoaded,
      )(
        doc,
        { addEventListener: () => {}, matchMedia: () => ({ matches: false }) },
        () => {},
        () => ({}),
      )
      await new Promise((r) => setTimeout(r, 10))
    } finally {
      ;(globalThis as any).fetch = realFetch
    }
    assert.strictEqual(calls, 0)
  })

  test("css styles the sim-qa column like qa, in its own tint", () => {
    assert.match(Decor.css, /\[data-status="sim-qa"\]/)
    assert.match(Decor.css, /\.boards-simcount/)
  })
})

describe("empty status columns (CV-25)", () => {
  test("every missing status goes in front of the next present one, in board order", () => {
    assert.deepStrictEqual(missingColumns(["backlog", "qa", "done"], STATUS_ORDER), [
      { status: "todo", before: "qa" },
      { status: "in-progress", before: "qa" },
      { status: "in-review", before: "qa" },
      { status: "sim-qa", before: "qa" },
      { status: "reopened", before: "done" },
    ])
  })
  test("a status after the last present one goes at the end", () => {
    assert.deepStrictEqual(
      missingColumns(
        ["backlog", "todo", "in-progress", "in-review", "sim-qa", "qa", "reopened"],
        STATUS_ORDER,
      ),
      [{ status: "done", before: null }],
    )
  })
  test("a board grouped by something else is left alone", () => {
    assert.deepStrictEqual(missingColumns(["backlog", "VELA-12 Epic"], STATUS_ORDER), [])
    assert.deepStrictEqual(missingColumns([], STATUS_ORDER), [])
  })
  test("the embedded script carries the order", () => {
    assert.ok(Decor.afterDOMLoaded.includes(JSON.stringify(STATUS_ORDER)))
  })
})

describe("task popup links (CV-25)", () => {
  const here = new URL("http://localhost:8484/projects/vela/tasks/vela-board.base")
  const u = (p: string) => new URL(p, here)
  test("a task note opens in the popup", () => {
    assert.strictEqual(opensInPopup(u("vela-92-communication-notifications"), here), true)
  })
  test("the board itself, another board, files and other sites do not", () => {
    assert.strictEqual(opensInPopup(u("vela-board.base"), here), false)
    assert.strictEqual(opensInPopup(u("../../alon-app/tasks/alon-app-board.base"), here), false)
    assert.strictEqual(opensInPopup(u("diagram.png"), here), false)
    assert.strictEqual(opensInPopup(new URL("https://example.com/x"), here), false)
  })
})

describe("status labels (CV-26)", () => {
  test("a label maps back to its status, so a second run keeps the column tagged", () => {
    for (const [status, label] of Object.entries(STATUS_LABELS)) {
      assert.strictEqual(columnStatus(label, STATUS_LABELS), status)
      assert.strictEqual(columnStatus(status, STATUS_LABELS), status)
    }
  })
})

describe("wheel device (CV-27)", () => {
  const ev = (o: Partial<Parameters<typeof isMouse>[0]>) => ({
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    ...o,
  })
  test("line and page deltas are a mouse", () => {
    assert.strictEqual(isMouse(ev({ deltaY: 3, deltaMode: 1 })), true)
    assert.strictEqual(isMouse(ev({ deltaY: 1, deltaMode: 2 })), true)
  })
  test("macOS mouse steps (multiples of 4.000244140625 px) are a mouse, even with a -3x wheelDelta", () => {
    assert.strictEqual(isMouse(ev({ deltaY: 4.000244140625, wheelDeltaY: -12 })), true)
    assert.strictEqual(isMouse(ev({ deltaY: -12.000732421875, wheelDeltaY: 36 })), true)
    // shift + wheel on a Mac: the step moves to deltaX
    assert.strictEqual(isMouse(ev({ deltaX: 8.00048828125, wheelDeltaX: -24 })), true)
  })
  test("a 120-per-notch wheelDelta that breaks the trackpad ratio is a mouse", () => {
    assert.strictEqual(isMouse(ev({ deltaY: 100, wheelDeltaY: -120 })), true)
    assert.strictEqual(isMouse(ev({ deltaX: 100, wheelDeltaX: -120 })), true)
  })
  test("trackpad deltas (wheelDelta = -3 x delta) are not a mouse, also at a page zoom", () => {
    assert.strictEqual(isMouse(ev({ deltaY: 4, wheelDeltaY: -12 })), false)
    assert.strictEqual(
      isMouse(ev({ deltaX: -7, deltaY: 1, wheelDeltaX: 21, wheelDeltaY: -3 })),
      false,
    )
    // 110% zoom: the DOM delta is divided by the zoom, wheelDelta is not
    assert.strictEqual(isMouse(ev({ deltaY: 9.090909, wheelDeltaY: -30 })), false)
  })
  test("without wheelDelta (Firefox on a Mac): a whole coarse single-axis step is a mouse", () => {
    assert.strictEqual(isMouse(ev({ deltaY: 48 })), true)
    assert.strictEqual(isMouse(ev({ deltaY: 2.5 })), false)
    assert.strictEqual(isMouse(ev({ deltaX: 3, deltaY: 6 })), false)
  })
})

describe("wheel listener (CV-27)", () => {
  // a board whose scrollLeft cannot move (hidden, snapping, or clamped by the browser)
  const setup = (opts: { connected?: boolean; stuck?: boolean } = {}) => {
    let wheelFn: ((e: any) => void) | null = null
    const frames: Array<() => void> = []
    let left = 0
    const board: any = {
      isConnected: opts.connected ?? true,
      clientWidth: 900,
      scrollWidth: 2400,
      get scrollLeft() {
        return left
      },
      set scrollLeft(v: number) {
        if (!opts.stuck) left = v
      },
      dataset: {},
      __boardsFade: false,
      addEventListener: (name: string, fn: any) => {
        if (name === "wheel") wheelFn = fn
      },
      scrollBy: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
    }
    const doc: any = {
      querySelectorAll: (sel: string) => (sel === ".bases-board" ? [board] : []),
      querySelector: () => null,
      addEventListener: () => {},
    }
    new Function(
      "document",
      "window",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "getComputedStyle",
      "localStorage",
      Decor.afterDOMLoaded,
    )(
      doc,
      { addEventListener: () => {}, matchMedia: () => ({ matches: false }) },
      (f: () => void) => (frames.push(f), frames.length),
      () => {},
      () => ({ scrollSnapType: "none", direction: "ltr" }),
      { getItem: () => null },
    )
    const wheel = (o: any) => {
      let prevented = false
      wheelFn!({
        deltaX: 0,
        deltaY: 0,
        deltaMode: 0,
        timeStamp: 1000,
        target: {},
        preventDefault: () => (prevented = true),
        ...o,
      })
      return prevented
    }
    const drain = (max = 500) => {
      let n = 0
      while (frames.length && n++ < max) frames.shift()!()
      return n
    }
    return { board, wheel, drain, left: () => left }
  }
  test("a mouse notch moves the board sideways, eased to the target, then the loop stops", () => {
    const t = setup()
    assert.strictEqual(t.wheel({ deltaY: 3, deltaMode: 1 }), true)
    const n = t.drain()
    assert.ok(n < 500, "loop stopped")
    assert.strictEqual(t.left(), 120)
  })
  test("the loop stops when the board cannot move or is gone", () => {
    const stuck = setup({ stuck: true })
    stuck.wheel({ deltaY: 3, deltaMode: 1 })
    assert.ok(stuck.drain() < 5)
    const gone = setup({ connected: false })
    gone.wheel({ deltaY: 3, deltaMode: 1 })
    assert.ok(gone.drain() < 5)
  })
  test("a trackpad vertical swipe is left to the column; a sideways one moves the board 1:1", () => {
    const t = setup()
    assert.strictEqual(t.wheel({ deltaY: 6, wheelDeltaY: -18 }), false)
    assert.strictEqual(t.wheel({ deltaX: 7, wheelDeltaX: -21, timeStamp: 2000 }), true)
    assert.strictEqual(t.left(), 7)
  })
  test("when every column fits, the mouse wheel is left to the column", () => {
    const t = setup()
    t.board.scrollWidth = 900
    assert.strictEqual(t.wheel({ deltaY: 3, deltaMode: 1 }), false)
  })
})
