# Project boards site

View-only local website for the project boards in ClaudeVault (`~/ClaudeVault`).
Built on Quartz v5 (upstream remote: `upstream`, branch `v5`) with the `@quartz-community/bases-page` plugin, which renders the vault's Obsidian Bases (`.base`) views.

- URL: http://localhost:8484 (board pages keep their `.base` path, e.g. `/Projects/alon-app/Tasks/Board.base`)
- `content` is a symlink to `~/ClaudeVault`. The site never writes to the vault.
- `quartz.config.yaml` `ignorePatterns` excludes everything except boards: Sessions, Daily, Memory, Topics, `_system`, `_raw`, Home, CLAUDE.md, area hubs (`Projects/*/*.md`) and each area's Decisions, Knowledge and Docs.
- Analytics are off; footer links removed.

## Layout

Board first. One narrow sidebar on the visual right (the site is RTL, so Quartz's `left` slot in the first grid column, `quartz/styles/custom.scss`). A fixed ☰ button in the top-right corner (`quartz/components/SidebarToggle.tsx`, added to every page header from `quartz.ts`) hides or shows it: hidden, the board takes the full width. The state is `html[data-boards-sidebar="collapsed"]`, kept in `localStorage` (`boards-sidebar`) and applied before first paint. The sidebar holds page title, search, dark mode and the board list (`quartz/components/BoardsNav.tsx`: one link per `type: board` note, the current board marked). Board links go to the board's `.base` page, which opens on the kanban (`bases-page` option `defaultViewType: board`) and is re-emitted on every task change; the board note only embeds the `.base` and is not re-emitted then, so it can lag until the next full build. No graph, table of contents, backlinks, explorer, breadcrumbs or reader mode (`enabled: false` in `quartz.config.yaml`). The center takes all remaining width (Quartz's page max-width is lifted). Kanban columns sit in one row, share the width equally and shrink to 190px (five columns fit from about 1300px); below that the board scrolls horizontally inside its own container, so no column is ever clipped. The server sends `Cache-Control: no-cache` (`quartz/cli/handlers.js`), and in serve mode `index.css`, `prescript.js` and `postscript.js` carry a content-hash query (`index.css?v=<hash>`, `quartz/plugins/emitters/componentResources.ts`), so the full-page live reload always loads a changed stylesheet. A tab opened before these fixes runs the old reload script and needs one manual refresh. After editing `quartz.config.yaml`, restart the service: a config hot-reload left the bases-page `defaultViewType` unapplied once. `quartz.ts` adds the board list to every page type's sidebar and swaps in a `PageTypeDispatcher` built from that layout (the YAML loader builds its own otherwise). The home page is the vault root `index.md` (written by claude-vault `board.write_index`): a list of board links, each board on its own page.

## Auto refresh

The server watches the vault (`content` symlink) and rebuilds the changed notes in about a second; every open page then reloads itself over the WebSocket on port 3001. Local fixes on top of upstream Quartz:

- `quartz/plugins/index.ts`: the page reconnects every 2 s after the socket drops (service restart, Mac sleep, suspended tab) and reloads once it is back.
- `quartz/build.ts`: the pending-change set is cleared after each rebuild (upstream never cleared it). A failed rebuild is logged with its files (`Rebuild failed (N in a row) for: …`) and dropped, so it cannot block every later rebuild and the browser reload; three failures in a row exit the process and launchd restarts it clean.
- `quartz/processors/parse.ts`: while serving, a note that fails to parse (e.g. bad frontmatter YAML) is skipped with ``Skipped note. Failed to process markdown `content/…` `` in the log instead of exiting; the site stays up and the note comes back on its next good save. `vault board check` names the same note. Plain `quartz build` still fails on it.

## Service

launchd agent `com.yair.project-boards-website` runs `bin/project-boards-website` (`npx quartz build --serve --watch --port 8484`).

- Plist: `~/Library/LaunchAgents/com.yair.project-boards-website.plist` (copy in `launchd/`).
- Wrapper: launchd runs the installed copy `~/.local/bin/project-boards-website`, not the repo file. macOS privacy (TCC) blocks shells started by launchd from reading `~/Documents`; the plist `WorkingDirectory` makes the repo the cwd, and node itself can read it. After editing `bin/project-boards-website`, copy it again.
- Logs: `~/Library/Logs/project-boards-website.log`. launchd opens it once at start: if it is deleted, the process keeps writing to the unlinked file and nothing is visible until the next restart (`launchctl kickstart -k`, below) recreates it.

Restart (e.g. after editing `quartz.config.yaml`):

```bash
launchctl kickstart -k gui/$(id -u)/com.yair.project-boards-website
```

Install or reinstall:

```bash
cp bin/project-boards-website ~/.local/bin/ && chmod +x ~/.local/bin/project-boards-website
cp launchd/com.yair.project-boards-website.plist ~/Library/LaunchAgents/
launchctl bootout gui/$(id -u)/com.yair.project-boards-website 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.yair.project-boards-website.plist
```
