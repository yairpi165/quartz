import test, { describe } from "node:test"
import assert from "node:assert"
import BoardsDecor, { kindOf, simBadge, columnStatus, SIM_QA_LABEL } from "./BoardsDecor"

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
  const win: any = { addEventListener: () => {} }
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

  test("columnStatus maps the Hebrew label back to the status and lowercases the rest", () => {
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
        { addEventListener: () => {} },
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
    assert.strictEqual(qaName.textContent, "qa")
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
        { addEventListener: () => {} },
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
