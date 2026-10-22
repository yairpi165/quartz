import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { PageTypes } from "./quartz/plugins"
import BoardsNav from "./quartz/components/BoardsNav"

const config = await loadQuartzConfig()

// The board list goes at the end of the sidebar on every page type (except 404, which has none).
// loadQuartzConfig builds the PageTypeDispatcher from the YAML layout, so swap in one built from this layout.
const layout = await loadQuartzLayout()
const boardsNav = BoardsNav()
layout.defaults.left = [...(layout.defaults.left ?? []), boardsNav]
for (const [pageType, pageLayout] of Object.entries(layout.byPageType)) {
  // a page type without its own `left` falls back to the defaults, which already have it
  if (pageType === "404" || !pageLayout.left) continue
  pageLayout.left = [...pageLayout.left, boardsNav]
}
config.plugins.emitters = config.plugins.emitters.map((emitter) =>
  emitter.name === "PageTypeDispatcher"
    ? PageTypes.PageTypeDispatcher({ defaults: layout.defaults, byPageType: layout.byPageType })
    : emitter,
)

export default config
export { layout }
