import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, resolveRelative } from "../util/path"
import { classNames } from "../util/lang"

// Sidebar list of the project boards: one link per board (`type: board` note in Projects/<Area>/Tasks/),
// labelled with its area, to the board's `.base` page: that page opens on the kanban and is re-emitted on
// every task change (the board note only embeds it and is not). The board of the current page is marked.
function BoardsNav({ fileData, allFiles, displayClass }: QuartzComponentProps) {
  const boards = allFiles
    .filter(
      (f) => f.frontmatter?.type === "board" && f.slug && f.relativePath?.startsWith("Projects/"),
    )
    .map((f) => ({
      slug: (f.slug + ".base") as FullSlug,
      folder: f.slug!.slice(0, f.slug!.lastIndexOf("/") + 1),
      area: f.relativePath!.split("/")[1],
    }))
    .sort((a, b) => a.area.localeCompare(b.area))
  const current = fileData.slug ?? ""

  return (
    <nav class={classNames(displayClass, "boards-nav")}>
      <h3>Boards</h3>
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
/* phone: the boards as a row of chips instead of a tall list */
@media (max-width: 800px) {
  .boards-nav h3 { display: none; }
  .boards-nav ul { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .boards-nav li a.internal {
    padding: 0.3rem 0.85rem;
    border: 1px solid var(--lightgray);
    border-radius: 999px;
    white-space: nowrap;
  }
}
`

export default (() => BoardsNav) satisfies QuartzComponentConstructor
