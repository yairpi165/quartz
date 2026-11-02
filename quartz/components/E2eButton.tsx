import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

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
      aria-label="רגרסיות E2E"
      title="רגרסיות E2E"
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
  const PRIO = { highest: "הכי גבוהה", high: "גבוהה", medium: "בינונית", low: "נמוכה", lowest: "הכי נמוכה" }
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
    if (!res.ok) throw new Error(data.error || "שגיאה " + res.status)
    return scoped(data.tasks || [])
  }
  const setCount = (n) => {
    document.querySelectorAll(".boards-e2e-button").forEach((b) => {
      b.hidden = !n
      const c = b.querySelector(".boards-e2e-count")
      if (c) c.textContent = String(n)
    })
  }
  const refreshCount = () => load().then((t) => setCount(t.length)).catch(() => {})

  let overlay = null
  const close = () => {
    if (overlay) overlay.remove()
    overlay = null
    refreshCount()
  }

  const row = (t) => {
    const c = el("section", "qa-card e2e-card")
    const head = el("h4", "qa-task-title")
    head.appendChild(el("span", "qa-id", t.id))
    const a = el("a", "e2e-link", " " + t.title)
    a.href = "/Projects/" + slug(t.area) + "/Tasks/" + slug(t.file)
    head.appendChild(a)
    c.appendChild(head)
    const meta = el("div", "e2e-meta")
    meta.appendChild(el("span", "e2e-prio e2e-prio-" + t.priority, "עדיפות: " + (PRIO[t.priority] || t.priority || "—")))
    meta.appendChild(el("span", "e2e-status", "סטטוס: " + t.status))
    c.appendChild(meta)
    return c
  }

  const render = (body, tasks) => {
    body.replaceChildren()
    if (!tasks.length) {
      body.appendChild(el("p", "qa-empty", "אין רגרסיות E2E פתוחות"))
      return
    }
    const byArea = {}
    tasks.forEach((t) => (byArea[t.area] = byArea[t.area] || []).push(t))
    Object.keys(byArea).sort().forEach((a) => {
      if (Object.keys(byArea).length > 1) body.appendChild(el("h3", "qa-area", a))
      byArea[a].forEach((t) => body.appendChild(row(t)))
    })
  }

  const open = async () => {
    if (overlay) return
    overlay = el("div", "qa-overlay")
    const dlg = el("div", "qa-dialog")
    dlg.setAttribute("role", "dialog")
    dlg.setAttribute("aria-modal", "true")
    dlg.setAttribute("aria-label", "רגרסיות E2E")
    const top = el("div", "qa-top")
    top.appendChild(el("h2", "qa-heading", "רגרסיות E2E"))
    const x = el("button", "qa-close", "✕")
    x.type = "button"
    x.setAttribute("aria-label", "סגור")
    x.addEventListener("click", close)
    top.appendChild(x)
    const body = el("div", "qa-body")
    body.appendChild(el("p", "qa-empty", "טוען…"))
    dlg.appendChild(top)
    dlg.appendChild(body)
    overlay.appendChild(dlg)
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close() })
    // Outside <body>: the SPA router patches body when the board rebuilds and would remove the popup.
    document.documentElement.appendChild(overlay)
    try {
      const t = await load()
      setCount(t.length)
      render(body, t)
    } catch (e) {
      body.replaceChildren(el("p", "qa-error", e.message))
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".boards-e2e-button")) open()
  })
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay) close() })
  document.addEventListener("nav", refreshCount)
  refreshCount()
}
`

E2eButton.css = `
.boards-e2e-button {
  position: fixed;
  top: 0.75rem;
  inset-inline-start: 8.2rem;
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
.boards-e2e-button:hover { color: #d64545; border-color: #d64545; }
.boards-e2e-count {
  margin-inline-start: 0.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: #d64545;
  color: #fff;
  font-size: 0.75rem;
}
.e2e-link { color: inherit; text-decoration: none; }
.e2e-link:hover { color: var(--secondary); text-decoration: underline; }
.e2e-meta { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; font-size: 0.85rem; color: var(--darkgray); }
.e2e-prio-highest, .e2e-prio-high { color: #d64545; font-weight: 600; }
`

export default (() => E2eButton) satisfies QuartzComponentConstructor
