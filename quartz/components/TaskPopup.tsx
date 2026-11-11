import { QuartzComponentConstructor } from "./types"

// Task popup (CV-25): a task (or epic) opened from a board page shows in a popup over the board instead of
// a page change, so the board keeps its tab, its sideways scroll and each column's scroll. A desktop
// popup is centred; on a phone it covers the screen. Close with ✕, Esc, a click on the backdrop, or the
// browser / phone back gesture (opening pushes a history entry that only carries the task's address, so
// back closes it). "פתח בדף מלא" still goes to the full page. Links inside the popup open in the popup.
// Like the QA popup, the overlay hangs on <html>, so an in-place refresh of <body> does not remove it.
// The router's popstate handler asks window.__boardsPopstate first (quartz/components/scripts/spa.inline.ts).

// Whether a click on this link (resolved against the current page) should open in the popup.
export function opensInPopup(href: URL, here: URL): boolean {
  if (href.origin !== here.origin) return false
  if (href.pathname === here.pathname) return false
  const last = href.pathname.split("/").pop() ?? ""
  // a file with an extension (image, pdf, .base board) is not a note page
  return !/\.[a-z0-9]+$/i.test(last)
}

function TaskPopup() {
  return null
}

TaskPopup.afterDOMLoaded = `
if (!window.__boardsTaskPopup) {
  window.__boardsTaskPopup = true
  const opensInPopup = ${opensInPopup.toString()}
  let overlay = null
  let lastFocus = null
  let loadSeq = 0
  let rendered = location.pathname
  const el = (tag, cls, text) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text !== undefined) n.textContent = text
    return n
  }
  const onBoard = () => !!document.querySelector(".bases-page")

  const closeUI = () => {
    if (!overlay) return
    overlay.remove()
    overlay = null
    document.documentElement.classList.remove("boards-task-open")
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true })
    lastFocus = null
  }
  // ✕ / Esc / backdrop: step back over the entry the popup pushed, so back history stays clean
  const close = () => {
    if (history.state && history.state.boardsTask) history.back()
    else closeUI()
  }

  const decorate = (root, url) => {
    root.querySelectorAll("script").forEach((n) => n.remove())
    root.querySelectorAll("[href]").forEach((a) => {
      const h = a.getAttribute("href")
      if (h && !h.startsWith("#")) a.setAttribute("href", new URL(h, url).href)
    })
    root.querySelectorAll("[src]").forEach((n) => n.setAttribute("src", new URL(n.getAttribute("src"), url).href))
    root.querySelectorAll("p, li, blockquote").forEach((n) => {
      if (!n.hasAttribute("dir")) n.setAttribute("dir", "auto")
    })
    // same tags as the task page (BoardsDecor: status label, "מאמץ: L")
    if (window.__boardsTagProps) window.__boardsTagProps(root)
    if (window.__boardsEmptySections) window.__boardsEmptySections(root)
  }

  const load = (href) => {
    const seq = ++loadSeq
    const body = overlay.querySelector(".boards-task-body")
    overlay.querySelector(".boards-task-full").href = href
    body.replaceChildren(el("p", "boards-task-status", "טוען…"))
    body.scrollTop = 0
    const url = new URL(href, location.href)
    const pre = window.quartzPrefetch && window.quartzPrefetch.load ? window.quartzPrefetch.load(url) : null
    Promise.resolve(pre)
      .then((p) => (p && typeof p.text === "string" ? p.text : fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(r.status)))))
      .then((html) => {
        if (seq !== loadSeq || !overlay) return
        const doc = new DOMParser().parseFromString(html, "text/html")
        // only the note's properties and its article: the page header also holds the site's buttons
        const art = doc.querySelector(".center article")
        if (!art) throw new Error("no article")
        const box = el("div", "boards-task-content")
        const props = doc.querySelector(".center .page-header .note-properties")
        const title = doc.querySelector(".center .page-header .article-title")
        if (title && !art.querySelector("h1")) box.appendChild(el("h1", "", title.textContent.trim()))
        if (props) box.appendChild(document.importNode(props, true))
        box.appendChild(document.importNode(art, true))
        decorate(box, url)
        body.replaceChildren(box)
        const h = box.querySelector("article h1") || box.querySelector(".article-title")
        overlay.querySelector(".boards-task-panel").setAttribute("aria-label", h ? h.textContent.trim() : "משימה")
      })
      .catch(() => {
        if (seq !== loadSeq || !overlay) return
        body.replaceChildren(el("p", "boards-task-status", "לא הצלחתי לטעון את המשימה. אפשר לפתוח אותה בדף מלא."))
      })
  }

  const show = (href) => {
    if (!overlay) {
      lastFocus = document.activeElement
      overlay = el("div", "boards-task-overlay")
      const panel = el("div", "boards-task-panel")
      panel.setAttribute("role", "dialog")
      panel.setAttribute("aria-modal", "true")
      const bar = el("div", "boards-task-bar")
      const full = el("a", "boards-task-full", "פתח בדף מלא ↗")
      const x = el("button", "boards-task-close", "✕")
      x.type = "button"
      x.setAttribute("aria-label", "סגירה")
      x.addEventListener("click", close)
      bar.append(full, x)
      panel.append(bar, el("div", "boards-task-body"))
      overlay.appendChild(panel)
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close()
      })
      document.documentElement.appendChild(overlay)
      document.documentElement.classList.add("boards-task-open")
      x.focus({ preventScroll: true })
    }
    load(href)
  }

  const open = (href) => {
    const state = Object.assign({}, history.state || {}, { boardsTask: href })
    if (history.state && history.state.boardsTask) history.replaceState(state, "")
    else history.pushState(state, "")
    show(href)
  }

  // capture phase: runs before the router's own click handler (on window) and stops it
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const t = e.target
      if (!t || !t.closest) return
      const inPopup = overlay && overlay.contains(t)
      if (inPopup) {
        const a = t.closest("a[href]")
        if (!a || a.classList.contains("boards-task-full")) {
          if (a) closeUI()
          return
        }
        const h = a.getAttribute("href")
        if (h.startsWith("#")) return
        const url = new URL(a.href)
        if (url.origin !== location.origin) return
        e.preventDefault()
        e.stopPropagation()
        open(url.href)
        return
      }
      const listLink = t.closest(".qa-overlay a[href]")
      if (listLink) {
        const u = new URL(listLink.href, location.href)
        if (!opensInPopup(u, new URL(location.href))) return
        e.preventDefault()
        e.stopPropagation()
        // the QA / E2E popup closes on Escape
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
        open(u.href)
        return
      }
      if (!onBoard()) return
      let a = t.closest(".bases-page a[href]")
      if (!a) {
        // anywhere on a board card opens the card's task
        const card = t.closest(".bases-board-card")
        a = card && card.querySelector(":scope > a[href]")
      }
      if (!a) return
      const url = new URL(a.href, location.href)
      if (!opensInPopup(url, new URL(location.href))) return
      e.preventDefault()
      e.stopPropagation()
      open(url.href)
    },
    true,
  )
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay) close()
  })
  // back / forward: true = handled here, the router must not re-render the page
  window.__boardsPopstate = () => {
    if (rendered !== location.pathname) {
      closeUI()
      return false
    }
    const s = history.state
    if (s && s.boardsTask) {
      show(s.boardsTask)
      return true
    }
    if (overlay) {
      closeUI()
      return true
    }
    return false
  }
  // after a page change (incl. coming back from the full page to an entry that had the popup open)
  document.addEventListener("nav", () => {
    rendered = location.pathname
    const s = history.state
    if (s && s.boardsTask && onBoard()) show(s.boardsTask)
    else if (!onBoard()) closeUI()
  })
}
`

TaskPopup.css = `
.boards-task-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.55);
}
html.boards-task-open, html.boards-task-open body { overflow: hidden; }
.boards-task-panel {
  display: flex;
  flex-direction: column;
  width: min(48rem, 100%);
  max-height: min(52rem, 100%);
  border: 1px solid var(--lightgray);
  border-radius: 12px;
  background: var(--light);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.boards-task-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem 0.6rem 1.25rem;
  border-bottom: 1px solid var(--lightgray);
}
.boards-task-full {
  font-size: 0.85rem;
  color: var(--darkgray);
  background: none !important;
}
.boards-task-full:hover { color: var(--secondary); }
.boards-task-close {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: none;
  color: var(--darkgray);
  font-size: 1rem;
  cursor: pointer;
}
.boards-task-close:hover { color: var(--secondary); border-color: var(--secondary); }
.boards-task-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 1rem 1.5rem 1.5rem;
}
.boards-task-body article h1 { margin: 0.25rem 0 0.75rem; font-size: 1.6rem; }
.boards-task-body article > :first-child { margin-top: 0; }
.boards-task-status { color: var(--gray); }
.boards-task-content .boards-empty-section { display: none; }
/* the overlay hangs on <html>, outside <body> and .page, so it inherits none of their type rules */
.boards-task-overlay { font-family: var(--bodyFont); color: var(--darkgray); }
.boards-task-content :is(h1, h2, h3, h4) { font-family: var(--headerFont); color: var(--dark); }
.boards-task-content :is(ul, ol) { padding-inline-start: 1.5rem; }
/* an English task item is LTR inside an RTL list: indent the item itself (on its own start side), so the
   checkbox, which hangs before the text, stays inside the panel */
.boards-task-content ul.contains-task-list { padding-inline: 0; }
.boards-task-content li:has(> input[type="checkbox"]) { list-style-type: none; padding-inline-start: 1.5rem; }
.boards-task-content li:has(> input[type="checkbox"]:checked) {
  text-decoration: line-through;
  text-decoration-color: var(--gray);
  color: var(--gray);
}
.boards-task-content li > * { margin-top: 0; margin-bottom: 0; }
.boards-task-content :is(p, li) { line-height: 1.6rem; }
.boards-task-content p > strong { color: var(--dark); }
.boards-task-content pre { overflow-x: auto; }
@media (max-width: 800px) {
  .boards-task-overlay { padding: 0; align-items: stretch; }
  .boards-task-panel {
    width: 100%;
    max-height: none;
    border: 0;
    border-radius: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .boards-task-bar { padding-top: max(0.6rem, env(safe-area-inset-top)); }
  .boards-task-body { padding: 0.75rem 1rem 1.5rem; }
  .boards-task-body article h1 { font-size: 1.35rem; }
}
`

export default (() => TaskPopup) satisfies QuartzComponentConstructor
