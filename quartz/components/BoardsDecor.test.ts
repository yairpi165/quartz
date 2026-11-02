import test, { describe } from "node:test"
import assert from "node:assert"
import BoardsDecor, { kindOf } from "./BoardsDecor"

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
