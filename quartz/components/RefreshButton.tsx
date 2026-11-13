import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

// Reload button for the phone: the page is locked (only the columns scroll), so pull-to-refresh never
// fires. It sits at the top-right of the top bar, away from the sidebar / QA / E2E / search buttons on
// the left, and is hidden above the phone breakpoint.
function RefreshButton({ displayClass }: QuartzComponentProps) {
  return (
    <button
      type="button"
      class={classNames(displayClass, "boards-refresh-button")}
      aria-label="Refresh page"
      title="Refresh page"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  )
}

RefreshButton.afterDOMLoaded = `
if (!window.__boardsRefreshButton) {
  window.__boardsRefreshButton = true
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest(".boards-refresh-button")) return
    location.reload()
  })
}
`

RefreshButton.css = `
.boards-refresh-button {
  position: fixed;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 10;
  display: none;
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
.boards-refresh-button:active { color: var(--secondary); border-color: var(--secondary); }
@media (max-width: 800px) {
  .boards-refresh-button { display: grid; }
}
`

export default (() => RefreshButton) satisfies QuartzComponentConstructor
