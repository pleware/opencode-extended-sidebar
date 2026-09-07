![OpenCode Extended Sidebar](https://raw.githubusercontent.com/pleware/opencode-extended-sidebar/main/assets/branding.png)

# OpenCode Extended Sidebar | TUI Plugin

**Mission control for your OpenCode agents — right inside the TUI.**

Switch sessions, watch tools run live, see which files changed, and where the time went. No browser, no dashboard, four tiny dependencies.

![OpenCode plugin](https://img.shields.io/badge/OpenCode-TUI%20plugin-000?style=flat-square) ![CI](https://github.com/pleware/opencode-extended-sidebar/actions/workflows/ci.yml/badge.svg) ![npm](https://img.shields.io/npm/v/opencode-extended-sidebar) ![codecov](https://codecov.io/gh/pleware/opencode-extended-sidebar/branch/main/graph/badge.svg) ![Runtime deps](https://img.shields.io/badge/runtime%20deps-4-brightgreen?style=flat-square) ![Read only](https://img.shields.io/badge/database-read--only-blue?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)

OpenCode shows one conversation at a time. This panel puts the rest of the work on screen. It reads OpenCode's own database — nothing to sync, no daemon.

## Features


| Feature             | What you get                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------- |
| **My work**         | Questions, recent sessions, and (with OMO) plan queues waiting on you                     |
| **Sessions**        | Title, age, live mark, `[C]` current. Header `switch` / `new`; palette `nw` / slash `/nw` |
| **Live pulse**      | State + direction glyphs (working, queued, failed, streaming, waiting)                    |
| **Tool calls**      | Named rows with duration; click for metadata — never args or output                       |
| **Files**           | `+N −M` and git letters; Markdown preview; `view all` picker                              |
| **Delegates**       | Tokens, status, pulse; click to jump                                                      |
| **Stats**           | Wait / think / stream / tools, plus a tok/s bar and charts popup (`C`)                    |
| **Privacy**         | Read-only database. No prompts, tool I/O, patches, or absolute paths                      |
| **Fits the window** | `oes.json` counts are ceilings; lists end in `… +N more`                                  |


Four tabs: **My work** · **Session** · **Project** · **Stats**. Glyphs, colours, and per-row behaviour: [docs/panel.md](docs/panel.md).


| Tab         | Shows                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| **My work** | Open questions, recent sessions (`switch` / `new`), OMO plan queues, `Draft docs` + `Plans` archives |
| **Session** | This agent, its delegates, tools, files, and (with OMO) drafts it wrote                              |
| **Project** | Tools and files every recent session touched                                                         |
| **Stats**   | Timing                                                                                               |


OMO (Oh My OpenAgent) is optional. Without `.omo/` the plan groups are gone; questions and sessions still work.

## Install

This is a TUI plugin. It belongs in `tui.json`, not `opencode.json`.

```sh
opencode plugin opencode-extended-sidebar --global
```

Or add the npm name in `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-extended-sidebar"]
}
```

Restart the OpenCode TUI. OpenCode installs the package from npm. For local development, point `plugin` at a `file:///` path to this checkout.

## Configuration

Later files win: plugin defaults → `~/.config/opencode/oes.json` → `<project>/oes.json`.

```json
{
  "fileRows": 8,
  "perfHistory": 3,
  "perfRows": 5,
  "perfTurns": 120,
  "questionReconcileSec": 15,
  "sessionDimHours": 48,
  "sessionFetch": 10,
  "sessionVisibleHours": 72,
  "skipGitignore": false,
  "toolRows": 5,
  "toolFetch": 20
}
```


| Key                    | Default | What it controls                                    |
| ---------------------- | ------- | --------------------------------------------------- |
| `fileRows`             | `8`     | most file rows shown                                |
| `perfHistory`          | `3`     | sessions under Perf → History; `0` hides it         |
| `perfRows`             | `5`     | rows per Perf section                               |
| `perfTurns`            | `120`   | recent turns Perf measures                          |
| `questionReconcileSec` | `15`    | seconds between full open-question rescans          |
| `sessionDimHours`      | `48`    | hours after which a still-visible session is dimmed |
| `sessionFetch`         | `10`    | recent sessions in the My work `Sessions` group     |
| `sessionVisibleHours`  | `72`    | hours a session stays visible after its last update |
| `skipGitignore`        | `false` | also honour the project's root `.gitignore`         |
| `toolRows`             | `5`     | most tool-call rows shown                           |
| `toolFetch`            | `20`    | tool-call history behind `… +N more`                |


Row counts are ceilings. Changes apply on the next refresh. Hidden files come from `.oesignore` (always) and, when enabled, `.gitignore`.

## Debug

Set the variable **before** starting OpenCode, then restart the TUI.

```bash
OES_DEBUG_OPENCODE=1 opencode
```

```powershell
$env:OES_DEBUG_OPENCODE = "1"
opencode
```


| Variable             | Role                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OES_DEBUG_OPENCODE` | `1` / `true` / `yes` / `on` writes to the plugin `logs/` directory. Any other non-empty value is a path. `0` / `false` / `no` / `off` turns it off |
| `OES_DEBUG_PROFILE`  | Times plugin entry points; writes `oes-profile-YYYY-MM-DD.log`                                                                                     |


While a logger is on, the sidebar shows a `self` cost line and a short debug console. Logging never crashes the panel.

## How it works

A read-only view of data OpenCode already stores.


| Source          | Path                                                         | Used for                            |
| --------------- | ------------------------------------------------------------ | ----------------------------------- |
| OpenCode SQLite | `~/.local/share/opencode/opencode.db` (or `OPENCODE_DB`)     | sessions, tools, files, timings     |
| OMO             | `<project>/.omo/`                                            | plan approvals (My work) — optional |
| `oes.json`      | plugin / user config / project                               | display limits                      |
| ignore files    | `<project>/.oesignore` · `.gitignore` (with `skipGitignore`) | files hidden from the panel         |


Runtime snapshot runs in a Bun worker so SQLite reads do not block the UI. Four runtime packages — `[ignore](https://www.npmjs.com/package/ignore)`, `[asciichart](https://www.npmjs.com/package/asciichart)`, `[simple-statistics](https://www.npmjs.com/package/simple-statistics)`, `[@crafter/charts](https://www.npmjs.com/package/@crafter/charts)` — each with zero transitive dependencies. Everything else is an OpenCode peer.

## Contributing

Issues and pull requests are welcome. Constraints: read-only OpenCode data, no prompts or tool I/O in the UI, every row must survive a narrow terminal.

Every commit patch-bumps `package.json` and prepends one English sentence to [CHANGELOG.md](CHANGELOG.md). Write that sentence as the first line of the commit message. A green CI run on `main` publishes that version to npm.

`bun test` runs unit and fixture tests. `bun run typecheck` checks types. `bun run bench` times the 5k-part scan.

## License

MIT. Copyright © 2026 [pleware](https://github.com/pleware) | pware.ai

## Acknowledgements

This plugin started as a TUI take on the same idea as [Phrouros](https://github.com/disaeye/phrouros). Thank you to [disaeye](https://github.com/disaeye).