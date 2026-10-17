# Project boards site

View-only local website for the project boards in ClaudeVault (`~/ClaudeVault`).
Built on Quartz v5 (upstream remote: `upstream`, branch `v5`) with the `@quartz-community/bases-page` plugin, which renders the vault's Obsidian Bases (`.base`) views.

- URL: http://localhost:8484 (board pages keep their `.base` path, e.g. `/Projects/alon-app/Tasks/Board.base`)
- `content` is a symlink to `~/ClaudeVault`. The site never writes to the vault.
- `quartz.config.yaml` `ignorePatterns` excludes everything except boards: Sessions, Daily, Memory, Topics, `_system`, `_raw`, Home, CLAUDE.md, area hubs (`Projects/*/*.md`) and each area's Decisions, Knowledge and Docs.
- Analytics are off; footer links removed.

## Service

launchd agent `com.yair.projectboards` runs `npx quartz build --serve --watch --port 8484`.
The plist lives at `~/Library/LaunchAgents/com.yair.projectboards.plist`; a copy is in `launchd/`.

```bash
launchctl kickstart -k gui/$(id -u)/com.yair.projectboards
```

Restart (e.g. after editing `quartz.config.yaml`). Logs: `~/Library/Logs/projectboards.log`.

Install or reinstall the agent:

```bash
cp launchd/com.yair.projectboards.plist ~/Library/LaunchAgents/
launchctl bootout gui/$(id -u)/com.yair.projectboards 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.yair.projectboards.plist
```
