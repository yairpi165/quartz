import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

// Button that shows or hides the board sidebar. It sits fixed in the top corner on the sidebar's side,
// so it stays reachable when the sidebar is hidden; collapsed, the board takes the full width.
// State: html[data-boards-sidebar="collapsed"], remembered in localStorage ("collapsed" / "open"; unset
// means the default for the screen width).
const STORAGE_KEY = "boards-sidebar"

function SidebarToggle({ displayClass }: QuartzComponentProps) {
  return (
    <button
      type="button"
      class={classNames(displayClass, "boards-sidebar-toggle")}
      aria-label="הצג או הסתר את התפריט"
      title="הצג או הסתר את התפריט"
    >
      ☰
    </button>
  )
}

// Before first paint, so a reload does not flash the sidebar open. With no saved choice the sidebar is
// open on a wide screen and closed on a phone or a laptop/tablet up to 1200px (CV-26), where it would
// cover most of the first screen or a quarter of the board.
SidebarToggle.beforeDOMLoaded = `
{
  let stored = null
  try { stored = localStorage.getItem("${STORAGE_KEY}") } catch (e) {}
  const collapsed = stored ? stored === "collapsed" : window.matchMedia("(max-width: 1200px)").matches
  if (collapsed) document.documentElement.setAttribute("data-boards-sidebar", "collapsed")
}
`

// One delegated listener: SPA navigation re-renders the button, the listener stays.
SidebarToggle.afterDOMLoaded = `
if (!window.__boardsSidebarToggle) {
  window.__boardsSidebarToggle = true
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest(".boards-sidebar-toggle")) return
    const root = document.documentElement
    const collapsed = root.getAttribute("data-boards-sidebar") !== "collapsed"
    if (collapsed) root.setAttribute("data-boards-sidebar", "collapsed")
    else root.removeAttribute("data-boards-sidebar")
    try {
      localStorage.setItem("${STORAGE_KEY}", collapsed ? "collapsed" : "open")
    } catch (err) {}
  })
}
`

SidebarToggle.css = `
.boards-sidebar-toggle {
  position: fixed;
  top: 0.75rem;
  inset-inline-start: 0.75rem;
  z-index: 10;
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: var(--light);
  color: var(--darkgray);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}
.boards-sidebar-toggle:hover {
  color: var(--secondary);
  border-color: var(--secondary);
}
`

export default (() => SidebarToggle) satisfies QuartzComponentConstructor
