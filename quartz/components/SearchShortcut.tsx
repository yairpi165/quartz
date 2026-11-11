import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

// Search from the top bar (CV-26): the search box lives in the sidebar, which is closed by default on a
// phone and up to 1200px, so this button (next to QA / E2E) opens the same search overlay from anywhere.
// custom.scss keeps the closed sidebar invisible but rendered, so the overlay inside it can still show.
function SearchShortcut({ displayClass }: QuartzComponentProps) {
  return (
    <button
      type="button"
      class={classNames(displayClass, "boards-search-shortcut")}
      aria-label="חיפוש"
      title="חיפוש"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </button>
  )
}

SearchShortcut.afterDOMLoaded = `
if (!window.__boardsSearchShortcut) {
  window.__boardsSearchShortcut = true
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest(".boards-search-shortcut")) return
    const b = document.querySelector(".search .search-button")
    if (b) b.click()
  })
}
`

SearchShortcut.css = `
.boards-search-shortcut {
  position: fixed;
  top: 0.75rem;
  /* after QA and E2E: their start + two 4.9rem buttons + two 0.5rem gaps */
  inset-inline-start: calc(var(--boards-buttons-start, 3.5rem) + 10.8rem);
  z-index: 10;
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  padding: 0;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: var(--light);
  color: var(--darkgray);
  cursor: pointer;
}
.boards-search-shortcut:hover { color: var(--secondary); border-color: var(--secondary); }
`

export default (() => SearchShortcut) satisfies QuartzComponentConstructor
