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
// What a status is called on the site (CV-26: column headers, table cells, task tags, popups). The vault
// keeps the English keys; data-status / data-value keep them too.
export const STATUS_LABELS: Record<string, string> = {
  backlog: "ממתין",
  todo: "לביצוע",
  "in-progress": "בעבודה",
  "in-review": "בסקירת קוד",
  "sim-qa": SIM_QA_LABEL,
  qa: "QA מכשיר",
  reopened: "נפתח מחדש",
  done: "הושלם",
  cancelled: "בוטל",
}
// A column header's text (the plugin's raw status, or a label this script already put there) -> status.
// Self-contained (the labels are passed in) because the script embeds it with toString().
export function columnStatus(text: string, labels: Record<string, string> = {}): string {
  const s = text.trim().toLowerCase()
  if (s === "qa סימולטור") return "sim-qa"
  for (const k of Object.keys(labels)) if (labels[k].toLowerCase() === s) return k
  return s
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
  const LABELS = ${JSON.stringify(STATUS_LABELS)}
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
        if (n) byStatus[${columnStatus.toString()}(n.textContent, LABELS)] = c
      })
      ;(${missingColumns.toString()})(Object.keys(byStatus), ${JSON.stringify(STATUS_ORDER)}).forEach(({ status, before }) => {
        const col = document.createElement("div")
        col.className = "bases-board-column boards-empty-column"
        const head = document.createElement("div")
        head.className = "bases-board-column-header"
        const name = document.createElement("span")
        name.textContent = LABELS[status] || status
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
      const status = ${columnStatus.toString()}(name.textContent, LABELS)
      col.dataset.status = status
      const label = LABELS[status]
      if (label && name.textContent !== label) name.textContent = label
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
  // table column titles on the site (CV-26); unknown columns keep the plugin's text
  const HEADS = {
    "file.name": "מזהה",
    title: "משימה",
    epic: "Epic",
    status: "סטטוס",
    priority: "עדיפות",
    effort: "מאמץ",
    owner: "אחראי",
    updated: "עודכן",
    created: "נוצר",
    done: "הושלם ב-",
  }
  // done / total per epic id, counted from the board view's cards (every non-cancelled task is there)
  const epicProgress = () => {
    const by = {}
    document.querySelectorAll(".bases-board-column").forEach((col) => {
      const done = col.dataset.status === "done"
      col.querySelectorAll('.bases-board-card-row[data-prop="epic"] .bases-board-card-value').forEach((v) => {
        const id = idOf(v.title || v.textContent)
        if (!id) return
        const e = (by[id] = by[id] || { done: 0, total: 0 })
        e.total += 1
        if (done) e.done += 1
      })
    })
    return by
  }
  const tables = () => {
    let progress = null
    document.querySelectorAll("table.bases-table").forEach((table) => {
      const ths = Array.from(table.querySelectorAll("thead th"))
      ths.forEach((th, i) => {
        const col = th.dataset.column
        const head = th.querySelector(".bases-table-header")
        if (head && HEADS[col] && head.textContent !== HEADS[col]) head.textContent = HEADS[col]
        table.querySelectorAll("tbody tr:not(.bases-table-group-header)").forEach((tr) => {
          const td = tr.children[i]
          if (!td) return
          td.dataset.col = col
          if (col === "updated" || col === "created" || col === "done") td.classList.add("boards-nowrap")
          if (col === "file.name") {
            td.classList.add("boards-nowrap")
            const a = td.querySelector("a")
            const id = a && idOf(a.textContent)
            if (a && id) {
              if (!a.title) a.title = a.textContent.trim()
              a.textContent = id
            }
          }
          if (col === "status") {
            const raw = td.dataset.raw || td.textContent.trim().toLowerCase()
            td.dataset.raw = raw
            if (LABELS[raw] && td.textContent.trim() !== LABELS[raw]) td.textContent = LABELS[raw]
          }
          if (col === "epic") {
            // the id only, as on the cards; the full name stays in the hover title
            const a = td.querySelector("a") || td.querySelector(".bases-text")
            const id = a && idOf(a.textContent)
            if (a && id && a.textContent.trim() !== id) {
              if (!td.title) td.title = a.textContent.trim()
              a.textContent = id
            }
          }
        })
      })
      // group rows: the value only, in the site's words; "no epic" goes last, epics show their progress
      const tbody = table.querySelector("tbody")
      const groups = Array.from(table.querySelectorAll("tr.bases-table-group-header"))
      groups.forEach((gr) => {
        const prop = gr.querySelector(".bases-table-group-property")
        const label = gr.querySelector(".bases-table-group-label")
        if (!label) return
        const key = (gr.dataset.prop || (prop ? prop.textContent.trim().toLowerCase() : "")).trim()
        gr.dataset.prop = key
        const raw = gr.dataset.raw !== undefined ? gr.dataset.raw : label.textContent.trim()
        gr.dataset.raw = raw
        const none = raw === "Uncategorized" || raw === ""
        gr.dataset.none = none ? "1" : ""
        let text = raw.replace(/^\\[\\[|\\]\\]$/g, "")
        if (key === "status") text = LABELS[raw.toLowerCase()] || raw
        if (none) text = key === "epic" ? "ללא epic" : "ללא"
        if (label.textContent !== text) label.textContent = text
        if (key === "epic" && !none) {
          progress = progress || epicProgress()
          const p = progress[idOf(text) || ""]
          let tag = gr.querySelector(".boards-epic-progress")
          if (p) {
            if (!tag) {
              tag = document.createElement("span")
              tag.className = "boards-epic-progress"
              gr.querySelector("td").appendChild(tag)
            }
            tag.textContent = "הושלמו " + p.done + " מתוך " + p.total
          }
        }
      })
      const last = groups.find((g) => g.dataset.none === "1" && g.dataset.prop === "epic")
      if (last && tbody && groups.length > 1 && groups[groups.length - 1] !== last) {
        const rows = [last]
        let n = last.nextElementSibling
        while (n && !n.classList.contains("bases-table-group-header")) {
          rows.push(n)
          n = n.nextElementSibling
        }
        rows.forEach((r) => tbody.appendChild(r))
      }
    })
  }
  const bidi = () => {
    document
      .querySelectorAll(".center article p, .center article li, .center article blockquote")
      .forEach((n) => {
        if (!n.hasAttribute("dir")) n.setAttribute("dir", "auto")
      })
  }
  // task page / popup: a template heading with nothing under it (empty Summary, Context, ...) is hidden
  const emptySections = (root) => {
    root.querySelectorAll("article h2").forEach((h) => {
      const n = h.nextElementSibling
      h.classList.toggle("boards-empty-section", !n || /^H[12]$/.test(n.tagName))
    })
  }
  window.__boardsEmptySections = emptySections
  // home: one card per board (same order as the sidebar) with what waits there: QA and E2E counts
  const home = () => {
    if (!document.body || document.body.dataset.slug !== "index") return
    const list = document.querySelector(".center article ul")
    if (!list || list.dataset.boardsHome) return
    const links = Array.from(list.querySelectorAll("a.internal"))
    if (!links.length) return
    list.dataset.boardsHome = "1"
    const grid = document.createElement("div")
    grid.className = "boards-home"
    links
      .map((a) => ({ name: a.textContent.trim(), href: a.getAttribute("href") }))
      .sort((x, y) => x.name.localeCompare(y.name))
      .forEach((b) => {
        const card = document.createElement("a")
        card.className = "boards-home-card internal"
        card.href = b.href
        card.dataset.area = b.name
        const name = document.createElement("span")
        name.className = "boards-home-name"
        name.textContent = b.name
        const meta = document.createElement("span")
        meta.className = "boards-home-meta"
        card.append(name, meta)
        grid.appendChild(card)
      })
    list.after(grid)
    const count = (tasks) => {
      const by = {}
      ;(tasks || []).forEach((t) => (by[t.area] = (by[t.area] || 0) + 1))
      return by
    }
    Promise.all([
      fetch("/api/qa", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("/api/e2e", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]).then(([qa, e2e]) => {
      const q = count(qa.tasks)
      const e = count(e2e.tasks)
      grid.querySelectorAll(".boards-home-card").forEach((card) => {
        const meta = card.querySelector(".boards-home-meta")
        const parts = []
        const nq = q[card.dataset.area] || 0
        const ne = e[card.dataset.area] || 0
        const chip = (text, on) => {
          const c = document.createElement("span")
          c.className = "boards-home-chip" + (on ? " is-on" : "")
          c.textContent = text
          return c
        }
        parts.push(chip(nq ? nq + " לבדיקת QA" : "אין QA פתוח", nq > 0))
        if (ne) parts.push(chip(ne + " רגרסיות E2E", true))
        meta.replaceChildren(...parts)
      })
    })
  }
  // the board view tab is remembered per board (CV-26); restored once per page show
  const TAB_KEY = "boards-tab:"
  const tabMemory = () => {
    const tabs = document.querySelector(".bases-view-tabs")
    if (!tabs) return
    const key = TAB_KEY + location.pathname
    if (!tabs.__boardsTabs) {
      tabs.__boardsTabs = true
      tabs.addEventListener("click", (e) => {
        const b = e.target.closest && e.target.closest("button")
        if (!b) return
        try {
          localStorage.setItem(key, b.textContent.trim())
        } catch (err) {}
      })
    }
    if (tabs.__boardsRestored === location.pathname) return
    tabs.__boardsRestored = location.pathname
    let want = null
    try {
      want = localStorage.getItem(key)
    } catch (err) {}
    if (!want) return
    const b = Array.from(tabs.querySelectorAll("button")).find((x) => x.textContent.trim() === want)
    if (b && !b.classList.contains("is-active")) setTimeout(() => b.click(), 0)
  }
  // done column: newest first, only the latest 30 until "show all" (it holds hundreds of cards)
  const DONE_CAP = 30
  const doneCap = () => {
    document.querySelectorAll('.bases-board-column[data-status="done"] .bases-board-column-body').forEach((body) => {
      const cards = Array.from(body.querySelectorAll(":scope > .bases-board-card"))
      const num = (c) => {
        const n = c.querySelector('.bases-board-card-row[data-prop="name"]')
        const m = n && /-(\\d+)/.exec(n.textContent)
        return m ? Number(m[1]) : 0
      }
      const sorted = cards.slice().sort((a, b) => num(b) - num(a))
      if (sorted.some((c, i) => c !== cards[i])) sorted.forEach((c) => body.appendChild(c))
      const all = body.dataset.showAll === "1"
      sorted.forEach((c, i) => c.classList.toggle("boards-capped", !all && i >= DONE_CAP))
      let more = body.querySelector(":scope > .boards-more")
      if (sorted.length > DONE_CAP && !all) {
        if (!more) {
          more = document.createElement("button")
          more.type = "button"
          more.className = "boards-more"
          more.addEventListener("click", () => {
            body.dataset.showAll = "1"
            doneCap()
          })
        }
        more.textContent = "הצג את כל " + sorted.length
        body.appendChild(more)
      } else if (more) more.remove()
    })
  }
  // a board page's title: "vela board" -> "vela" (the sidebar's name for it)
  const boardTitle = () => {
    if (!document.querySelector(".bases-page")) return
    const h = document.querySelector(".page-header .article-title")
    if (h && / board$/i.test(h.textContent.trim())) h.textContent = h.textContent.trim().replace(/ board$/i, "")
  }
  // English runs inside a Hebrew title are isolated, so "/retry" or "Face ID" keep their own order; a run
  // never ends on punctuation, so brackets and colons around it stay in the Hebrew flow and mirror right
  const LATIN = /[A-Za-z0-9\\/](?:[\\w\\/.+#:'-]*[A-Za-z0-9])?(?:\\s+[A-Za-z0-9\\/](?:[\\w\\/.+#:'-]*[A-Za-z0-9])?)*/g
  const isolate = (el) => {
    if (!el || el.dataset.bdi === "1" || el.querySelector("bdi")) return
    el.dataset.bdi = "1"
    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType !== 3 || !/[֐-׿]/.test(node.nodeValue)) return
      const text = node.nodeValue
      const frag = document.createDocumentFragment()
      let last = 0
      text.replace(LATIN, (m, at) => {
        if (at > last) frag.appendChild(document.createTextNode(text.slice(last, at)))
        const b = document.createElement("bdi")
        b.textContent = m
        frag.appendChild(b)
        last = at + m.length
        return m
      })
      if (!last) return
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
      node.replaceWith(frag)
    })
  }
  const isolateTitles = () => {
    document.querySelectorAll(".bases-board-card > a, .bases-table td[data-col='title'] a").forEach(isolate)
  }
  const title = () => {
    const t = document.querySelector(".page-header .article-title")
    const h = document.querySelector(".center article h1")
    if (!t) return
    const norm = (x) => x.replace(/[\u2018\u2019\u02bc\u0060]/g, "'").trim()
    t.classList.toggle("boards-dup-title", !!h && norm(h.textContent).includes(norm(t.textContent)))
  }
  // note properties as tags: data-key / data-value carry the raw vault values (CSS keys on them), the
  // text shows the site's words (status label, "מאמץ: L"). data-raw keeps the raw value across re-runs.
  const tagProps = (root) => {
    root.querySelectorAll(".note-properties").forEach((d) => {
      d.open = true
      d.querySelectorAll(".note-properties-row").forEach((r) => {
        const k = r.querySelector(".note-properties-key")
        const v = r.querySelector(".note-properties-text")
        if (k) r.dataset.key = k.textContent.trim().toLowerCase()
        if (!v) return
        const raw = r.dataset.raw !== undefined ? r.dataset.raw : v.textContent.trim().toLowerCase()
        r.dataset.raw = raw
        r.dataset.value = raw
        if (r.dataset.key === "status" && LABELS[raw]) v.textContent = LABELS[raw]
        if (r.dataset.key === "effort" && raw) v.textContent = "מאמץ: " + raw.toUpperCase()
      })
    })
  }
  const props = () => tagProps(document)
  window.__boardsTagProps = tagProps
  // search preview (rendered by the search plugin outside .center): same reading direction and tags
  const preview = (root) => {
    root.querySelectorAll("p, li, blockquote, h1, h2, h3, h4").forEach((n) => {
      if (!n.hasAttribute("dir")) n.setAttribute("dir", "auto")
    })
    tagProps(root)
  }
  if (typeof MutationObserver === "function") {
    new MutationObserver((muts) => {
      muts.forEach((m) => {
        const t = m.target
        const box = t && t.closest ? t.closest(".preview-container") : null
        if (box) preview(box)
      })
    }).observe(document.documentElement, { childList: true, subtree: true })
  }
  // phone: the view tabs are one sideways row; keep the active one in sight
  const activeTab = () => {
    const t = document.querySelector(".bases-view-tabs button.is-active")
    if (t && t.scrollIntoView) t.scrollIntoView({ block: "nearest", inline: "nearest" })
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".bases-view-tabs button")) requestAnimationFrame(activeTab)
  })
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
    doneCap()
    tables()
    bidi()
    title()
    props()
    back()
    emptySections(document)
    home()
    boardTitle()
    isolateTitles()
    tabMemory()
    activeTab()
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
      // reversed on purpose (CV-26, Yair): on this RTL board the browser's direction felt backwards; the
      // column order is unchanged, only the way a desktop swipe moves the board. Phone swipes stay native.
      board.scrollLeft -= dx
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
  grid-auto-rows: 1.6rem;
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
/* half the tasks are high: only "highest" is a filled tag, "high" an outline, the rest quiet text (CV-26) */
.bases-board-card-row[data-priority="highest"] .bases-board-card-value { background: #d64545; color: #fff; }
.bases-board-card-row[data-priority="high"] .bases-board-card-value { background: none; border: 1px solid #e8863a; color: #e8863a; }
.bases-board-card-row[data-priority="medium"] .bases-board-card-value,
.bases-board-card-row[data-priority="low"] .bases-board-card-value,
.bases-board-card-row[data-priority="lowest"] .bases-board-card-value { background: none; color: var(--gray); }

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
  font-size: 0.75rem;
  line-height: 1;
}
.bases-board-card-meta > .bases-board-card-row .bases-board-card-value .bases-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* depth (CV-26): page, column and card were one colour, told apart only by hairlines */
.bases-board-column { background: color-mix(in srgb, var(--light) 96%, var(--dark)); }
.bases-board-column-header { background: inherit; }
.bases-board-card { background: var(--light); }
:root[saved-theme="dark"] .bases-board-card { background: color-mix(in srgb, var(--light) 90%, var(--dark)); }
:root[saved-theme="dark"] .bases-board-column { background: color-mix(in srgb, var(--light) 95%, var(--dark)); }

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

/* tables (CV-26): read from the right like the rest of the site; a quiet group bar; links as text */
/* the plugin's overflow:hidden (for the rounded corners) breaks the sticky header row */
.bases-view table.bases-table { overflow: visible; }
.bases-view table.bases-table :is(th, td) { text-align: start; }
.bases-view table.bases-table thead th { position: sticky; top: 0; }
.bases-view .bases-table-header-sort { right: auto; inset-inline-end: 8px; }
.bases-table-group-header td { background: color-mix(in srgb, var(--light) 92%, var(--dark)); border-bottom: 1px solid var(--lightgray); }
.bases-table-group-property { display: none; }
.bases-table-group-label { margin: 0; margin-inline-end: 0.5rem; }
.boards-epic-progress { margin-inline-start: 0.6rem; color: var(--gray); font-size: 0.8rem; font-weight: 400; }
.bases-table td[data-col="title"] a.internal,
.bases-table td[data-col="epic"] a.internal { background: none; padding: 0; color: var(--dark); }
.bases-table td[data-col="title"] a.internal:hover { color: var(--secondary); }
.bases-table td[data-col="file.name"] a { font-family: var(--codeFont); font-size: 0.8rem; background: none; padding: 0; direction: ltr; }
.bases-table td[data-col="epic"] { font-family: var(--codeFont); font-size: 0.8rem; }

/* phone: every row is a small card (title on top, the rest on one line under it), no sideways table */
@media (max-width: 800px) {
  .bases-table-wrapper { overflow-x: visible; }
  .bases-table thead { display: none; }
  .bases-table, .bases-table tbody { display: block; border: 0; }
  .bases-table tr:not(.bases-table-group-header) {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
    padding: 0.65rem 0.25rem;
    border-bottom: 1px solid var(--lightgray);
  }
  .bases-table tr:not(.bases-table-group-header) td {
    display: block;
    padding: 0;
    border: 0;
    font-size: 0.8rem;
    color: var(--gray);
    line-height: 1.4;
  }
  .bases-table td:empty { display: none; }
  .bases-table td[data-col="title"] { flex: 1 0 100%; order: -1; font-size: 0.95rem; font-weight: 600; }
  .bases-table td[data-col="title"] a.internal { color: var(--dark); }
  .bases-table tr.bases-table-group-header { display: block; }
  .bases-table tr.bases-table-group-header td { display: block; padding: 0.5rem 0.6rem; border-radius: 8px; }
}
.boards-nowrap { white-space: nowrap; }

/* task page and task popup: the note properties as a row of small tags instead of a boxed table */
:is(.center, .boards-task-content, .preview-container) .note-properties { margin: 0.4rem 0 0.8rem; border: 0 !important; background: none !important; }
:is(.center, .boards-task-content, .preview-container) .note-properties-header { display: none !important; }
:is(.center, .boards-task-content, .preview-container) .note-properties-table,
:is(.center, .boards-task-content, .preview-container) .note-properties-table tbody { display: flex; flex-wrap: wrap; gap: 0.4rem; width: auto; border: 0 !important; }
:is(.center, .boards-task-content, .preview-container) .note-properties-row { display: inline-flex; border: 0; }
:is(.center, .boards-task-content, .preview-container) .note-properties-row td { padding: 0; border: 0; }
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-value=""] { display: none; }
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="status"] { order: -2; }
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="priority"] { order: -1; }
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="status"] .note-properties-key,
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="priority"] .note-properties-key,
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="owner"] .note-properties-key,
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="effort"] .note-properties-key { display: none; }
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="status"] .note-properties-value,
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="priority"] .note-properties-value,
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="owner"] .note-properties-value,
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="effort"] .note-properties-value {
  padding: 0 0.65rem;
  border-radius: 999px;
  background: var(--lightgray);
  color: var(--darkgray);
  font-size: 0.8rem;
  line-height: 1.7;
}
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="status"][data-value="done"] .note-properties-value { background: #2e9d57; color: #fff; }
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="status"][data-value="sim-qa"] .note-properties-value { background: #3a9d8f; color: #fff; }
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="status"][data-value="qa"] .note-properties-value { background: var(--secondary); color: var(--light); }
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="priority"][data-value="highest"] .note-properties-value { background: #d64545; color: #fff; }
:is(.center, .boards-task-content, .preview-container) .note-properties-row[data-key="priority"][data-value="high"] .note-properties-value { background: #e8863a; color: #fff; }

/* task page */
.boards-dup-title { display: none; }
.boards-empty-section { display: none; }
/* a readable line length for the note text (not on board pages) */
body:not(:has(.bases-page)) .center :is(article, .page-header) { max-width: 48rem; }
@media (max-width: 800px) {
  .center article h1, .center .page-header h1 { font-size: 1.45rem; line-height: 1.3; }
}

/* done column cap */
.bases-board-card.boards-capped { display: none; }
.boards-more {
  margin: 0.25rem 0;
  padding: 0.5rem;
  border: 1px dashed var(--lightgray);
  border-radius: 10px;
  background: none;
  color: var(--darkgray);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.boards-more:hover { color: var(--secondary); border-color: var(--secondary); }

/* home: a card per board */
.center article ul[data-boards-home] { display: none; }
body[data-slug="index"] .center > hr { display: none; }
.boards-home {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}
.boards-home-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--lightgray);
  border-radius: 12px;
  background: color-mix(in srgb, var(--light) 95%, var(--dark)) !important;
  color: var(--dark) !important;
  text-decoration: none;
}
.boards-home-card:hover { border-color: var(--secondary); }
.boards-home-name { font-family: var(--headerFont); font-size: 1.25rem; font-weight: 700; }
.boards-home-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; min-height: 1.5rem; }
.boards-home-chip { padding: 0.1rem 0.6rem; border-radius: 999px; background: var(--lightgray); color: var(--gray); font-size: 0.8rem; }
.boards-home-chip.is-on { background: var(--secondary); color: var(--light); }
/* an English task item is LTR inside the RTL page: indent the item on its own start side so the
   checkbox, which hangs before the text, stays on the page */
.page .center article ul.contains-task-list { padding-inline: 0; }
.page .center article li:has(> input[type="checkbox"]) { padding-inline-start: 1.5rem; }
.boards-back {
  display: inline-block;
  margin: 0 0 0.4rem;
  font-size: 0.85rem;
  color: var(--darkgray);
}
.boards-back:hover { color: var(--secondary); }
`

export default (() => BoardsDecor) satisfies QuartzComponentConstructor
