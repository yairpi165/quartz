import { QuartzComponentConstructor } from "./types"

// Presentation tweaks for the boards that the generated HTML cannot express (the board/table markup comes
// from the bases-page plugin, the notes from the vault). It renders nothing; its script tags the DOM with
// data attributes and its CSS keys on them. Runs on load and after every SPA navigation / in-place
// refresh (the `nav` event), and is idempotent because micromorph may re-use nodes.
//   - cards: the "Name" row shows only the task id, "Owner" is hidden, "Priority" is a coloured tag
//   - columns: tagged with their status so qa / in-review stand out and done is muted
//   - board: a fade on the side that has more columns off screen (the scrollbar is hidden)
//   - table: the id-only Name column, dates on one line
//   - task page: back link to the board, no duplicated title, English paragraphs read left to right
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
      if (key === "priority") row.dataset.priority = val.textContent.trim().toLowerCase()
    })
  }
  const columns = () => {
    document.querySelectorAll(".bases-board-column").forEach((col) => {
      const name = col.querySelector(".bases-board-column-header span")
      if (name) col.dataset.status = name.textContent.trim().toLowerCase()
    })
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
    columns()
    tables()
    bidi()
    title()
    props()
    back()
    fades()
    requestAnimationFrame(fades)
  }
  document.addEventListener("nav", run)
  window.addEventListener("resize", fades)
  run()
}
`

BoardsDecor.css = `
/* cards: id + priority tag on one line, no English labels, no owner */
.bases-board-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
}
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

/* columns: what waits for you stands out, finished work is quiet */
.bases-board-column[data-status="qa"] {
  border-color: var(--secondary);
  box-shadow: 0 0 0 1px var(--secondary);
}
.bases-board-column[data-status="qa"] .bases-board-column-header { color: var(--secondary); }
.bases-board-column[data-status="qa"] .bases-board-count { background: var(--secondary); color: var(--light); }
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

/* task page: the note properties as a row of small tags instead of a boxed table */
.center .note-properties { margin: 0.4rem 0 0.8rem; border: 0 !important; background: none !important; }
.center .note-properties-header { display: none !important; }
.center .note-properties-table,
.center .note-properties-table tbody { display: flex; flex-wrap: wrap; gap: 0.4rem; width: auto; border: 0 !important; }
.center .note-properties-row { display: inline-flex; border: 0; }
.center .note-properties-row td { padding: 0; border: 0; }
.center .note-properties-row[data-value=""] { display: none; }
.center .note-properties-row[data-key="status"] .note-properties-key,
.center .note-properties-row[data-key="priority"] .note-properties-key,
.center .note-properties-row[data-key="owner"] .note-properties-key,
.center .note-properties-row[data-key="effort"] .note-properties-key { display: none; }
.center .note-properties-row[data-key="status"] .note-properties-value,
.center .note-properties-row[data-key="priority"] .note-properties-value,
.center .note-properties-row[data-key="owner"] .note-properties-value,
.center .note-properties-row[data-key="effort"] .note-properties-value {
  padding: 0 0.65rem;
  border-radius: 999px;
  background: var(--lightgray);
  color: var(--darkgray);
  font-size: 0.8rem;
  line-height: 1.7;
}
.center .note-properties-row[data-key="status"][data-value="done"] .note-properties-value { background: #2e9d57; color: #fff; }
.center .note-properties-row[data-key="status"][data-value="qa"] .note-properties-value { background: var(--secondary); color: var(--light); }
.center .note-properties-row[data-key="priority"][data-value="highest"] .note-properties-value { background: #d64545; color: #fff; }
.center .note-properties-row[data-key="priority"][data-value="high"] .note-properties-value { background: #e8863a; color: #fff; }

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
