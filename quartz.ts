import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { PageTypes } from "./quartz/plugins"
import BoardsNav from "./quartz/components/BoardsNav"
import SidebarToggle from "./quartz/components/SidebarToggle"
import QaButton from "./quartz/components/QaButton"

const config = await loadQuartzConfig()

// The board list goes at the end of the sidebar, and the sidebar show/hide button into the header, on
// every page type (except 404, which has neither). loadQuartzConfig builds the PageTypeDispatcher from
// the YAML layout, so swap in one built from this layout.
const layout = await loadQuartzLayout()
const boardsNav = BoardsNav()
const sidebarToggle = SidebarToggle()
const qaButton = QaButton()
for (const [pageType, pageLayout] of Object.entries(layout.byPageType)) {
  if (pageType === "404") continue
  // page types share the defaults' header array; build a new one per page type
  pageLayout.header = [
    ...(pageLayout.header ?? layout.defaults.header ?? []),
    sidebarToggle,
    qaButton,
  ]
  // a page type without its own `left` falls back to the defaults, which get it below
  if (pageLayout.left) pageLayout.left = [...pageLayout.left, boardsNav]
}
layout.defaults.left = [...(layout.defaults.left ?? []), boardsNav]
layout.defaults.header = [...(layout.defaults.header ?? []), sidebarToggle, qaButton]
config.plugins.emitters = config.plugins.emitters.map((emitter) =>
  emitter.name === "PageTypeDispatcher"
    ? PageTypes.PageTypeDispatcher({ defaults: layout.defaults, byPageType: layout.byPageType })
    : emitter,
)

export default config
export { layout }
