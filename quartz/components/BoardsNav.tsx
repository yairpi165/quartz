import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, resolveRelative } from "../util/path"
import { classNames } from "../util/lang"

// Sidebar list of the project boards: one link per board note (`type: board`, Projects/<Area>/Tasks/),
// labelled with its area. The board of the current page (the board itself or one of its tasks) is marked.
function BoardsNav({ fileData, allFiles, displayClass }: QuartzComponentProps) {
  const boards = allFiles
    .filter(
      (f) => f.frontmatter?.type === "board" && f.slug && f.relativePath?.startsWith("Projects/"),
    )
    .map((f) => ({
      slug: f.slug as FullSlug,
      folder: f.slug!.slice(0, f.slug!.lastIndexOf("/") + 1),
      area: f.relativePath!.split("/")[1],
    }))
    .sort((a, b) => a.area.localeCompare(b.area))
  const current = fileData.slug ?? ""

  return (
    <nav class={classNames(displayClass, "boards-nav")}>
      <h3>לוחות</h3>
      <ul>
        {boards.map((b) => (
          <li>
            <a
              href={resolveRelative(fileData.slug as FullSlug, b.slug)}
              class={classNames(
                undefined,
                "internal",
                current.startsWith(b.folder) ? "active" : "",
              )}
            >
              {b.area}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

BoardsNav.css = `
.boards-nav h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}
.boards-nav ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.boards-nav li a.internal {
  display: block;
  padding: 0.3rem 0.5rem;
  border-radius: 5px;
  background: transparent;
  color: var(--darkgray);
}
.boards-nav li a.internal:hover {
  color: var(--tertiary);
}
.boards-nav li a.internal.active {
  background: var(--highlight);
  color: var(--secondary);
  font-weight: 600;
}
`

export default (() => BoardsNav) satisfies QuartzComponentConstructor
