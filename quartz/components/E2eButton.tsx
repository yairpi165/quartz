import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { STATUS_LABELS } from "./BoardsDecor"

// E2E regressions (CV-18): a button next to the QA button opens a read-only popup with every open task
// marked `found_by: e2e` on this board. The tasks stay in their own column (usually backlog); the popup
// never writes. Data comes from /api/e2e (quartz/cli/qa-api.js -> `vault qa serve`). It reuses the
// QA popup's classes (qa-overlay, qa-dialog, ...), whose CSS ships with QaButton. Everything the API
// returns is inserted as text.
function E2eButton({ displayClass }: QuartzComponentProps) {
  return (
    <button
      type="button"
      class={classNames(displayClass, "boards-e2e-button")}
      aria-label="E2E regressions"
      title="E2E regressions"
      hidden
    >
      E2E<span class="boards-e2e-count"></span>
    </button>
  )
}

E2eButton.afterDOMLoaded = `
if (!window.__boardsE2e) {
  window.__boardsE2e = true
  const el = (tag, cls, text) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text !== undefined) n.textContent = text
    return n
  }
  const slug = (s) => s.trim().replace(/\\s+/g, "-").replace(/[?#]/g, "").toLowerCase()
  const LABELS = ${JSON.stringify(STATUS_LABELS)}
  const PRIO = { highest: "Highest", high: "High", medium: "Medium", low: "Low", lowest: "Lowest" }
  // a Hebrew task title reads right to left inside the English popup
  const rtlIf = (node, text) => node.setAttribute("dir", /[\\u0590-\\u05FF]/.test(text) ? "rtl" : "auto")
  // On a board page only that board's tasks; anywhere else (home, a note) all boards'.
  const scoped = (tasks) => {
    const here = decodeURIComponent(location.pathname).toLowerCase()
    const mine = tasks.filter((t) => here.includes("/" + slug(t.area) + "/") || here.includes("/" + slug(t.area) + "-board"))
    return mine.length ? mine : tasks.filter(() => !/\\/projects\\//.test(here))
  }
  const load = async () => {
    const res = await fetch("/api/e2e", { cache: "no-store" })
    let data = {}
    try { data = await res.json() } catch (e) {}
    if (!res.ok) throw new Error(data.error || "Error " + res.status)
    return scoped(data.tasks || [])
  }
  const setCount = (n) => {
    document.querySelectorAll(".boards-e2e-button").forEach((b) => {
      // always shown (the top bar keeps one shape on every board); nothing to look at -> dimmed
      b.hidden = false
      b.classList.toggle("boards-zero", !n)
      const c = b.querySelector(".boards-e2e-count")
      if (c) c.textContent = String(n)
    })
  }
  const refreshCount = () => load().then((t) => setCount(t.length)).catch(() => {})

  let overlay = null
  // The list has its own history entry ({boardsList}), so the browser / phone back gesture closes it and a
  // task opened from it comes back to it (TaskPopup's popstate hook drives the restore).
  const closeUI = () => {
    if (overlay) overlay.remove()
    overlay = null
    refreshCount()
  }
  const close = () => {
    if (history.state && history.state.boardsList === "e2e" && !history.state.boardsTask) history.back()
    else closeUI()
  }

  const row = (t) => {
    const c = el("section", "qa-card e2e-card")
    const head = el("h4", "qa-task-title")
    rtlIf(head, t.title || "")
    head.appendChild(el("span", "qa-id", t.id))
    const a = el("a", "e2e-link", " " + t.title)
    a.href = "/Projects/" + slug(t.area) + "/Tasks/" + slug(t.file)
    head.appendChild(a)
    c.appendChild(head)
    // the group heading already says the status; priority shows only when it is not the usual "high"
    const meta = el("div", "e2e-meta")
    if (t.priority && t.priority !== "high")
      meta.appendChild(el("span", "e2e-prio e2e-prio-" + t.priority, "Priority: " + (PRIO[t.priority] || t.priority)))
    if (meta.childNodes.length) c.appendChild(meta)
    // the whole row opens the task (TaskPopup picks up the link click)
    c.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest("a")) return
      a.click()
    })
    return c
  }

  const render = (body, tasks) => {
    body.replaceChildren()
    if (!tasks.length) {
      body.appendChild(el("p", "qa-empty", "No open E2E regressions"))
      return
    }
    // by board (only when the list spans boards), then by status in board order
    const ORDER = ["backlog", "todo", "in-progress", "in-review", "sim-qa", "qa", "reopened", "done"]
    const rank = (st) => (ORDER.indexOf(st) < 0 ? 99 : ORDER.indexOf(st))
    const byArea = {}
    tasks.forEach((t) => (byArea[t.area] = byArea[t.area] || []).push(t))
    const areas = Object.keys(byArea).sort()
    areas.forEach((a) => {
      if (areas.length > 1) {
        const h = el("h3", "qa-area", a)
        h.appendChild(el("span", "qa-area-count", String(byArea[a].length)))
        body.appendChild(h)
      }
      let last = null
      byArea[a]
        .slice()
        .sort((x, y) => rank(x.status) - rank(y.status))
        .forEach((t) => {
          if (t.status !== last) {
            last = t.status
            body.appendChild(el("h4", "e2e-status-head", LABELS[t.status] || t.status))
          }
          body.appendChild(row(t))
        })
    })
  }

  const open = async (opts) => {
    if (overlay) return
    const o = opts || {}
    if (!o.noPush) history.pushState(Object.assign({}, history.state || {}, { boardsList: "e2e" }), "")
    overlay = el("div", "qa-overlay")
    const dlg = el("div", "qa-dialog")
    dlg.setAttribute("role", "dialog")
    dlg.setAttribute("aria-modal", "true")
    dlg.setAttribute("aria-label", "E2E regressions")
    const top = el("div", "qa-top")
    const heading = el("h2", "qa-heading", "E2E regressions")
    const progress = el("span", "qa-progress")
    heading.appendChild(progress)
    top.appendChild(heading)
    const x = el("button", "qa-close", "✕")
    x.type = "button"
    x.setAttribute("aria-label", "Close")
    x.addEventListener("click", close)
    top.appendChild(x)
    const body = el("div", "qa-body")
    body.appendChild(el("p", "qa-empty", "Loading…"))
    dlg.appendChild(top)
    dlg.appendChild(body)
    overlay.appendChild(dlg)
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close() })
    // Outside <body>: the SPA router patches body when the board rebuilds and would remove the popup.
    document.documentElement.appendChild(overlay)
    try {
      const t = await load()
      setCount(t.length)
      progress.textContent = t.length + " open"
      render(body, t)
      if (o.scroll) body.scrollTop = o.scroll
    } catch (e) {
      body.replaceChildren(el("p", "qa-error", e.message))
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".boards-e2e-button")) open()
  })
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay) close() })
  window.__boardsLists = window.__boardsLists || {}
  window.__boardsLists["e2e"] = {
    open: (o) => open(o),
    closeUI: () => closeUI(),
    isOpen: () => !!overlay,
    scroll: () => (overlay ? overlay.querySelector(".qa-body").scrollTop : 0),
  }
  document.addEventListener("nav", refreshCount)
  refreshCount()
}
`

E2eButton.css = `
.boards-e2e-button {
  position: fixed;
  top: 0.75rem;
  /* right after the QA button: its start + its 4.9rem min width + a 0.5rem gap */
  inset-inline-start: calc(var(--boards-buttons-start, 3.5rem) + 5.4rem);
  z-index: 10;
  height: 2.2rem;
  padding: 0 0.7rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: var(--light);
  color: var(--darkgray);
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}
.boards-e2e-button[hidden] { display: none; }
.boards-e2e-button:hover { color: var(--secondary); border-color: var(--secondary); }
.boards-e2e-count {
  margin-inline-start: 0.45rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--secondary);
  color: var(--light);
  font-size: 0.75rem;
}
.qa-heading { unicode-bidi: plaintext; }
.qa-progress { unicode-bidi: isolate; }
.e2e-link { color: inherit; text-decoration: none; }
.e2e-link:hover { color: var(--secondary); text-decoration: underline; }
.e2e-card { cursor: pointer; }
.e2e-card:hover .e2e-link { color: var(--secondary); }
.e2e-card .qa-task-title { margin: 0; }
.e2e-status-head { margin: 1rem 0 0; color: var(--gray); font-size: 0.8rem; font-weight: 600; }
.e2e-meta { margin-top: 0.35rem; display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; font-size: 0.85rem; color: var(--darkgray); }
.e2e-prio-highest { color: #d64545; font-weight: 600; }
.e2e-prio-high { color: #e8863a; font-weight: 600; }
`

export default (() => E2eButton) satisfies QuartzComponentConstructor
