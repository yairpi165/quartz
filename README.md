# Project boards site

View-only local website for the project boards in ClaudeVault (`~/ClaudeVault`).
Built on Quartz v5 (upstream remote: `upstream`, branch `v5`) with the `@quartz-community/bases-page` plugin, which renders the vault's Obsidian Bases (`.base`) views.

- URL: http://localhost:8484 (board pages keep their `.base` path, e.g. `/Projects/alon-app/Tasks/Board.base`)
- `content` is a symlink to `~/ClaudeVault`. The site never writes to the vault.
- `quartz.config.yaml` `ignorePatterns` excludes everything except boards: Sessions, Daily, Memory, Topics, `_system`, `_raw`, Home, CLAUDE.md, area hubs (`Projects/*/*.md`) and each area's Decisions, Knowledge and Docs.
- Analytics are off; footer links removed.

## Service

launchd agent `com.yair.project-boards-website` runs `bin/project-boards-website` (`npx quartz build --serve --watch --port 8484`).

- Plist: `~/Library/LaunchAgents/com.yair.project-boards-website.plist` (copy in `launchd/`).
- Wrapper: launchd runs the installed copy `~/.local/bin/project-boards-website`, not the repo file. macOS privacy (TCC) blocks shells started by launchd from reading `~/Documents`; the plist `WorkingDirectory` makes the repo the cwd, and node itself can read it. After editing `bin/project-boards-website`, copy it again.
- Logs: `~/Library/Logs/project-boards-website.log`.

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
