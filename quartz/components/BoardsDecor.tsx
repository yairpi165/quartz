import { QuartzComponentConstructor } from "./types"

// Presentation tweaks for the boards that the generated HTML cannot express (the board/table markup comes
// from the bases-page plugin, the notes from the vault). It renders nothing; its script tags the DOM with
// data attributes and its CSS keys on them. Runs on load and after every SPA navigation / in-place
// refresh (the `nav` event), and is idempotent because micromorph may re-use nodes.
//   - cards: the "Name" row shows only the task id, "Owner" is hidden, "Priority" is a coloured tag, and
//     "Kind" shows only for bugs, as a "bug" tag (CV-21; other kinds are hidden)
//   - columns: tagged with their status so qa / in-review stand out and done is muted
//   - board: a fade on the side that has more columns off screen (the scrollbar is hidden)
//   - table: the id-only Name column, dates on one line
//   - task page: back link to the board, no duplicated title, English paragraphs read left to right
// What the cards script stores in data-kind for a Kind cell's text (kept in sync by boardsDecor.test.ts).
export function kindOf(text: string): string {
  return text.trim().toLowerCase()
}

// The sim-qa column (CV-22): its header shows this label; the status stays "sim-qa" in data-status.
export const SIM_QA_LABEL = "QA סימולטור"
export function columnStatus(text: string): string {
  const s = text.trim().toLowerCase()
  return s === "qa סימולטור" ? "sim-qa" : s
}
// Every status column a board always shows, in board order (the bases formula `status_order`; CV-25).
// bases-page only builds a column for a status that has tasks, so the script adds empty ones for the rest
// and the columns never jump around or change width.
export const STATUS_ORDER = ["backlog", "todo", "in-progress", "in-review", "sim-qa", "qa", "reopened", "done"]
// For each missing status: the present status it goes in front of (null = at the end). Empty when the
// board is not a status board (a column that is not a known status).
// Self-contained (the order is passed in) because the script embeds it with toString().
export function missingColumns(
  present: string[],
  order: string[],
): { status: string; before: string | null }[] {
  if (!present.length || present.some((s) => !order.includes(s))) return []
  return order.filter((s) => !present.includes(s)).map((status) => {
    const i = order.indexOf(status)
    const next = present
      .filter((p) => order.indexOf(p) > i)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]
    return { status, before: next ?? null }
  })
}
// The count line on a sim-qa card: what is left for the simulator and for Yair's device.
export function simBadge(sim: number, device: number): string {
  return "[sim] " + sim + " / [device] " + device
}

function BoardsDecor() {
  return null
}

BoardsDecor.afterDOMLoaded = `
if (!window.__boardsDecor) {
  window.__boardsDecor = true
  const idOf = (s) => {
    const m = /^[A-Za-z]+-\\d+/.exec(s.trim())
    return m ? m[0] : null
  }
  const cards = () => {
    document.querySelectorAll(".bases-board-card-row").forEach((row) => {
      const label = row.querySelector(".bases-board-card-label")
      const val = row.querySelector(".bases-board-card-value")
      if (!label || !val) return
      const key = label.textContent.trim().toLowerCase()
      row.dataset.prop = key
      if (key === "name") {
        const text = val.textContent.trim()
        const id = idOf(text)
        if (id) {
          if (!row.title) row.title = text
          const span = val.querySelector(".bases-text") || val
          span.textContent = id
        }
      }
      if (key === "epic") {
        // the tag shows only the epic id (VELA-202); the full name stays in the hover title
        const a = val.querySelector("a") || val.querySelector(".bases-text") || val
        const text = a.textContent.trim()
        const id = idOf(text)
        if (id) {
          if (!val.title) val.title = text
          a.textContent = id
        }
      }
      if (key === "model") row.dataset.model = val.textContent.trim().toLowerCase()
      if (key === "kind") row.dataset.kind = ${kindOf.toString()}(val.textContent)
      if (key === "priority") row.dataset.priority = val.textContent.trim().toLowerCase()
    })
  }
  // add the empty status columns (an in-place refresh drops them; run() adds them back)
  const fill = () => {
    document.querySelectorAll(".bases-board").forEach((board) => {
      const cols = Array.from(board.querySelectorAll(":scope > .bases-board-column"))
      const byStatus = {}
      cols.forEach((c) => {
        const n = c.querySelector(".bases-board-column-header span")
        if (n) byStatus[${columnStatus.toString()}(n.textContent)] = c
      })
      ;(${missingColumns.toString()})(Object.keys(byStatus), ${JSON.stringify(STATUS_ORDER)}).forEach(({ status, before }) => {
        const col = document.createElement("div")
        col.className = "bases-board-column boards-empty-column"
        const head = document.createElement("div")
        head.className = "bases-board-column-header"
        const name = document.createElement("span")
        name.textContent = status === "sim-qa" ? ${JSON.stringify(SIM_QA_LABEL)} : status
        const count = document.createElement("span")
        count.className = "bases-board-count"
        count.textContent = "0"
        head.append(name, count)
        const body = document.createElement("div")
        body.className = "bases-board-column-body"
        const hint = document.createElement("div")
        hint.className = "boards-empty-hint"
        hint.textContent = "אין משימות"
        body.appendChild(hint)
        col.append(head, body)
        board.insertBefore(col, before ? byStatus[before] : null)
        byStatus[status] = col
      })
    })
  }
  const columns = () => {
    document.querySelectorAll(".bases-board-column").forEach((col) => {
      const name = col.querySelector(".bases-board-column-header span")
      if (!name) return
      const status = ${columnStatus.toString()}(name.textContent)
      col.dataset.status = status
      if (status === "sim-qa" && name.textContent !== ${JSON.stringify(SIM_QA_LABEL)})
        name.textContent = ${JSON.stringify(SIM_QA_LABEL)}
    })
    simCounts()
  }
  // sim-qa cards show "[sim] n / [device] m" (from /api/sim); only fetched when the board has that column
  const simCounts = () => {
    const cols = Array.from(document.querySelectorAll(".bases-board-column")).filter((c) => c.dataset.status === "sim-qa")
    if (!cols.length || typeof fetch !== "function") return
    fetch("/api/sim", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((d) => {
        const by = {}
        ;(d.tasks || []).forEach((t) => (by[t.id] = t))
        cols.forEach((col) =>
          col.querySelectorAll(".bases-board-card").forEach((card) => {
            const nameEl = card.querySelector('.bases-board-card-row[data-prop="name"] .bases-board-card-value')
            const id = nameEl && idOf(nameEl.textContent)
            const t = id && by[id]
            let badge = card.querySelector(".boards-simcount")
            if (!t) {
              if (badge) badge.remove()
              return
            }
            if (!badge) {
              badge = document.createElement("div")
              badge.className = "boards-simcount"
              card.appendChild(badge)
            }
            badge.textContent = ${simBadge.toString()}(t.sim, t.device)
          }),
        )
      })
      .catch(() => {})
  }
  const tables = () => {
    document.querySelectorAll("table.bases-table").forEach((table) => {
      Array.from(table.querySelectorAll("thead th")).forEach((th, i) => {
        const col = th.dataset.column
        table.querySelectorAll("tbody tr:not(.bases-table-group-header)").forEach((tr) => {
          const td = tr.children[i]
          if (!td) return
          if (col === "updated" || col === "created") td.classList.add("boards-nowrap")
          if (col === "file.name") {
            const a = td.querySelector("a")
            const id = a && idOf(a.textContent)
            if (a && id) {
              if (!a.title) a.title = a.textContent.trim()
              a.textContent = id
            }
          }
        })
      })
    })
  }
  const bidi = () => {
    document
      .querySelectorAll(".center article p, .center article li, .center article blockquote, .center article h2, .center article h3, .center article h4")
      .forEach((n) => {
        if (!n.hasAttribute("dir")) n.setAttribute("dir", "auto")
      })
  }
  const title = () => {
    const t = document.querySelector(".page-header .article-title")
    const h = document.querySelector(".center article h1")
    if (!t) return
    const norm = (x) => x.replace(/[\u2018\u2019\u02bc\u0060]/g, "'").trim()
    t.classList.toggle("boards-dup-title", !!h && norm(h.textContent).includes(norm(t.textContent)))
  }
  const props = () => {
    document.querySelectorAll(".note-properties").forEach((d) => {
      d.open = true
      d.querySelectorAll(".note-properties-row").forEach((r) => {
        const k = r.querySelector(".note-properties-key")
        const v = r.querySelector(".note-properties-text")
        if (k) r.dataset.key = k.textContent.trim().toLowerCase()
        if (v) r.dataset.value = v.textContent.trim().toLowerCase()
      })
    })
  }
  const back = () => {
    document.querySelectorAll(".boards-back").forEach((n) => n.remove())
    if (document.querySelector(".bases-page")) return
    const active = document.querySelector(".boards-nav a.active")
    const head = document.querySelector(".center .page-header")
    if (!active || !head) return
    const link = document.createElement("a")
    link.className = "boards-back internal"
    link.href = active.getAttribute("href")
    link.textContent = "→ חזרה ללוח " + active.textContent.trim()
    head.insertBefore(link, head.querySelector(".popover-hint"))
  }
  const fade = (b) => {
    const max = b.scrollWidth - b.clientWidth
    const pos = Math.abs(b.scrollLeft)
    const rtl = getComputedStyle(b).direction === "rtl"
    const more = (side) => (side === "end" ? pos < max - 1 : pos > 1)
    const left = rtl ? more("end") : more("start")
    const right = rtl ? more("start") : more("end")
    if (left) b.dataset.moreLeft = "1"
    else delete b.dataset.moreLeft
    if (right) b.dataset.moreRight = "1"
    else delete b.dataset.moreRight
  }
  const fades = () => {
    document.querySelectorAll(".bases-board").forEach((b) => {
      if (!b.__boardsFade) {
        b.__boardsFade = true
        b.addEventListener("scroll", () => fade(b), { passive: true })
      }
      fade(b)
    })
  }
  const run = () => {
    cards()
    fill()
    columns()
    tables()
    bidi()
    title()
    props()
    back()
    fades()
    requestAnimationFrame(fades)
  }
  // A sideways wheel / trackpad swipe (or shift + wheel) over the cards must move the whole board. The
  // browser latches the gesture to the column body (it scrolls vertically) and drops the horizontal part,
  // so route it to the board by hand.
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || !e.target.closest) return
      const board = e.target.closest(".bases-board")
      if (!board) return
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
      if (!dx || (!e.shiftKey && Math.abs(e.deltaX) <= Math.abs(e.deltaY))) return
      e.preventDefault()
      board.scrollLeft += dx
    },
    { passive: false },
  )
  document.addEventListener("nav", run)
  window.addEventListener("resize", fades)
  run()
}
`

BoardsDecor.css = `
/* cards: id + priority tag on one line, no English labels, no owner */
/* tags sit in a 3-column, 2-row matrix of equal cells: id | priority | model on the first row, bug | epic on
   the second. A card without a
   bug (or without an epic) closes the gap by moving the other tag into the first column. */
.bases-board-card-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 1.5rem;
  align-items: stretch;
  gap: 0.35rem 0.3rem;
}
.bases-board-card-meta > .bases-board-card-row { min-width: 0; }
.bases-board-card-meta > [data-prop="name"] { grid-area: 1 / 1; }
.bases-board-card-meta > [data-prop="priority"] { grid-area: 1 / 2; }
.bases-board-card-meta > [data-prop="model"] { grid-area: 1 / 3; }
.bases-board-card-meta > [data-prop="kind"] { grid-area: 2 / 1; }
.bases-board-card-meta > [data-prop="epic"] { grid-area: 2 / 2; }
.bases-board-card-meta:not(:has(> [data-prop="kind"][data-kind="bug"])) > [data-prop="epic"] { grid-area: 2 / 1; }
.bases-board-card-row[data-prop="owner"] { display: none; }
.bases-board-card-row[data-prop="name"] .bases-board-card-label,
.bases-board-card-row[data-prop="priority"] .bases-board-card-label { display: none; }
.bases-board-card-row[data-prop="name"] .bases-board-card-value {
  direction: ltr;
  font-family: var(--codeFont);
  font-size: 0.72rem;
  color: var(--gray);
}
.bases-board-card-row[data-prop="priority"] .bases-board-card-value {
  display: inline-block;
  padding: 0 0.55rem;
  border-radius: 999px;
  background: var(--lightgray);
  color: var(--darkgray);
  font-size: 0.72rem;
  line-height: 1.6;
}
.bases-board-card-row[data-priority="highest"] .bases-board-card-value { background: #d64545; color: #fff; }
.bases-board-card-row[data-priority="high"] .bases-board-card-value { background: #e8863a; color: #fff; }
.bases-board-card-row[data-priority="medium"] .bases-board-card-value { background: var(--highlight); color: var(--secondary); }

/* kind: only bugs get a tag (red outline, so it differs from the filled "highest" priority tag) */
.bases-board-card-row[data-prop="kind"] { display: none; }
.bases-board-card-row[data-prop="kind"][data-kind="bug"] { display: block; }
.bases-board-card-row[data-prop="kind"] .bases-board-card-label { display: none; }
.bases-board-card-row[data-prop="kind"] .bases-board-card-value {
  display: inline-block;
  padding: 0 0.55rem;
  border: 1px solid #d64545;
  border-radius: 999px;
  color: #d64545;
  font-size: 0.72rem;
  line-height: 1.5;
}

/* epic: the name of the card's epic as a small pink outline tag (same shape as the bug tag); the row is
   absent from the HTML when the task has no epic */
.bases-board-card-row[data-prop="epic"] { display: block; }
.bases-board-card-row[data-prop="epic"] .bases-board-card-label { display: none; }
.bases-board-card-row[data-prop="epic"] .bases-board-card-value {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: top;
  padding: 0 0.55rem;
  border: 1px solid #e0569f;
  border-radius: 999px;
  color: #e0569f;
  font-size: 0.72rem;
  line-height: 1.5;
}
.bases-board-card-row[data-prop="epic"] .bases-board-card-value a {
  color: inherit;
  background: none;
  text-decoration: none;
}

/* model: the model the task is meant for (opus / sonnet), a small outline tag; absent when unset */
.bases-board-card-row[data-prop="model"] { display: block; }
.bases-board-card-row[data-prop="model"] .bases-board-card-label { display: none; }
.bases-board-card-row[data-prop="model"] .bases-board-card-value {
  display: inline-block;
  padding: 0 0.55rem;
  border: 1px solid #8a7ee0;
  border-radius: 999px;
  color: #8a7ee0;
  font-size: 0.72rem;
  line-height: 1.5;
}
.bases-board-card-row[data-prop="model"][data-model="sonnet"] .bases-board-card-value { border-color: #3fb5a8; color: #3fb5a8; }

/* every cell of the tag matrix is the same size; the text is centred and cut with an ellipsis, never wrapped */
.bases-board-card-meta > .bases-board-card-row .bases-board-card-value {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 0 0.15rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 0.68rem;
  line-height: 1;
}
.bases-board-card-meta > .bases-board-card-row .bases-board-card-value .bases-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* card title: plain bold text (not Quartz's highlighted link box); the whole card opens the task popup */
.bases-board-card { cursor: pointer; gap: 0.6rem; transition: border-color 0.15s ease; }
.bases-board-card:hover { border-color: var(--secondary); }
.bases-board-card > a.internal {
  background: none;
  padding: 0;
  border-radius: 0;
  color: var(--dark);
  font-weight: 600;
  line-height: 1.4;
}
.bases-board-card > a.internal:hover { color: var(--secondary); }

/* an empty status column: same frame, a quiet hint instead of cards */
.boards-empty-hint {
  margin: 0.25rem 0;
  padding: 1.25rem 0.5rem;
  border: 1px dashed var(--lightgray);
  border-radius: 10px;
  color: var(--gray);
  font-size: 0.8rem;
  text-align: center;
}

/* columns: what waits for you stands out, finished work is quiet */
.bases-board-column[data-status="qa"] {
  border-color: var(--secondary);
  box-shadow: 0 0 0 1px var(--secondary);
}
.bases-board-column[data-status="qa"] .bases-board-column-header { color: var(--secondary); }
.bases-board-column[data-status="qa"] .bases-board-count { background: var(--secondary); color: var(--light); }
.bases-board-column[data-status="sim-qa"] {
  border-color: #3a9d8f;
  box-shadow: 0 0 0 1px #3a9d8f;
}
.bases-board-column[data-status="sim-qa"] .bases-board-column-header { color: #3a9d8f; }
.bases-board-column[data-status="sim-qa"] .bases-board-count { background: #3a9d8f; color: #fff; }
.boards-simcount {
  margin-top: 0.4rem;
  direction: ltr;
  font-family: var(--codeFont);
  font-size: 0.72rem;
  color: var(--gray);
}
.bases-board-column[data-status="in-review"] .bases-board-column-header { color: var(--tertiary); }
.bases-board-column[data-status="done"] .bases-board-card { opacity: 0.65; }

/* the scrollbar is hidden, so fade the edge that has more columns behind it */
.bases-board {
  --fade-left: 0px;
  --fade-right: 0px;
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--fade-left), #000 calc(100% - var(--fade-right)), transparent 100%);
  mask-image: linear-gradient(to right, transparent 0, #000 var(--fade-left), #000 calc(100% - var(--fade-right)), transparent 100%);
}
.bases-board[data-more-left] { --fade-left: 2.5rem; }
.bases-board[data-more-right] { --fade-right: 2.5rem; }

.bases-view-meta { display: none; }
.boards-nowrap { white-space: nowrap; }

/* task page and task popup: the note properties as a row of small tags instead of a boxed table */
:is(.center, .boards-task-content) .note-properties { margin: 0.4rem 0 0.8rem; border: 0 !important; background: none !important; }
:is(.center, .boards-task-content) .note-properties-header { display: none !important; }
:is(.center, .boards-task-content) .note-properties-table,
:is(.center, .boards-task-content) .note-properties-table tbody { display: flex; flex-wrap: wrap; gap: 0.4rem; width: auto; border: 0 !important; }
:is(.center, .boards-task-content) .note-properties-row { display: inline-flex; border: 0; }
:is(.center, .boards-task-content) .note-properties-row td { padding: 0; border: 0; }
:is(.center, .boards-task-content) .note-properties-row[data-value=""] { display: none; }
:is(.center, .boards-task-content) .note-properties-row[data-key="status"] .note-properties-key,
:is(.center, .boards-task-content) .note-properties-row[data-key="priority"] .note-properties-key,
:is(.center, .boards-task-content) .note-properties-row[data-key="owner"] .note-properties-key,
:is(.center, .boards-task-content) .note-properties-row[data-key="effort"] .note-properties-key { display: none; }
:is(.center, .boards-task-content) .note-properties-row[data-key="status"] .note-properties-value,
:is(.center, .boards-task-content) .note-properties-row[data-key="priority"] .note-properties-value,
:is(.center, .boards-task-content) .note-properties-row[data-key="owner"] .note-properties-value,
:is(.center, .boards-task-content) .note-properties-row[data-key="effort"] .note-properties-value {
  padding: 0 0.65rem;
  border-radius: 999px;
  background: var(--lightgray);
  color: var(--darkgray);
  font-size: 0.8rem;
  line-height: 1.7;
}
:is(.center, .boards-task-content) .note-properties-row[data-key="status"][data-value="done"] .note-properties-value { background: #2e9d57; color: #fff; }
:is(.center, .boards-task-content) .note-properties-row[data-key="status"][data-value="sim-qa"] .note-properties-value { background: #3a9d8f; color: #fff; }
:is(.center, .boards-task-content) .note-properties-row[data-key="status"][data-value="qa"] .note-properties-value { background: var(--secondary); color: var(--light); }
:is(.center, .boards-task-content) .note-properties-row[data-key="priority"][data-value="highest"] .note-properties-value { background: #d64545; color: #fff; }
:is(.center, .boards-task-content) .note-properties-row[data-key="priority"][data-value="high"] .note-properties-value { background: #e8863a; color: #fff; }

/* task page */
.boards-dup-title { display: none; }
.boards-back {
  display: inline-block;
  margin: 0 0 0.4rem;
  font-size: 0.85rem;
  color: var(--darkgray);
}
.boards-back:hover { color: var(--secondary); }
`

export default (() => BoardsDecor) satisfies QuartzComponentConstructor
