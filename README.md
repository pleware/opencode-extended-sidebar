<p align="center">
  <img src="https://raw.githubusercontent.com/pleware/opencode-extended-sidebar/main/assets/branding.png" alt="OpenCode Extended Sidebar" width="720" />
</p>

# OpenCode Extended Sidebar | TUI Plugin

**Mission control for your OpenCode agents — right inside the TUI.**

Switch sessions, watch tools run live, see which files changed, and where the time went. No browser, no dashboard, one tiny dependency.

![OpenCode plugin](https://img.shields.io/badge/OpenCode-TUI%20plugin-000?style=flat-square) ![Runtime deps](https://img.shields.io/badge/runtime%20deps-1-brightgreen?style=flat-square) ![Read only](https://img.shields.io/badge/database-read--only-blue?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)

---

## Demo

**[ demo recording goes here ]**

*A short GIF showing session switching, live tool activity and file diffs.*

---

## Why

OpenCode gives you one conversation at a time. Real work looks different: an orchestrator, delegates, tool calls, and a trail of edited files. Extended Sidebar puts that back on screen. It reads OpenCode's own database — nothing to sync, no daemon. Open the TUI and the panel is there.

## ⇄ Session switcher

> Recent sessions, one click away. Title, age, and whether it is still alive. The header shows the window — `Sessions (last 6)` — plus a `switch` label that opens the host session switcher (the same `/sessions` command). When more sessions were fetched, a clickable `… +N more` reveals the next four per click. Below the list, tools and files rolled up from those same recent sessions.

## ⊚ Live activity pulse

> A braille spinner for work in progress, a dot for idle, and a glyph for what is happening now: **↑** waiting on the model, **↓** receiving tokens, **→** a tool in flight. Colours come from your OpenCode theme.

## ≡ Tool Calls feed that names things

> Each row is labelled with what actually ran — command, file, pattern, or task — plus how long it took. Running calls tick live; failures show `×`. Click a tool for a metadata sheet (never args or output). **Project** carries the same feed rolled up from the sessions above. The feed shows the latest `toolRows` (default 5) and ends in a `… +N more` control that reveals the next batch with each click, up to `toolFetch` (default 20) rows of history.

## ± File changes with diff stats

> Files this session touched, with `+N −M` and git letters (`M` `A` `D` `R` `C` `U` `T` `?`). **V** means viewed — a session read with no git status. Click Markdown for a scrollable preview; other files open a detail sheet. **Project** merges the same list across the sessions above.
>
> Scratch dirs (`tmp/`, `.tmp/`, `.omo/`) and boilerplate filenames are hidden via the plugin's default `.oesignore`. The project's own `.oesignore` (gitignore format) is honoured automatically when present; set `skipGitignore` to also honour the project's `.gitignore`.

## ⋔ Delegates and sub-agents

> When an orchestrator hands work off, delegates appear as their own rows — tokens, status, pulse, click to jump. **Project** lists the project's boulder. **Session** lists only this session's children.

## ? My work — what is waiting on you

> One queue of things that need **your** action, shown first in the core group. Open `question` tools anywhere in the project appear as `?` rows — click to jump to the session and answer. OMO plans and drafts with `status: awaiting-approval` appear as `!` rows (plan name only, no extension) — click for a native, searchable picker: **Navigate to session** jumps to the session that wrote the plan (a muted reason is shown when no session is found), **Docs** opens the draft as a preview, and the **Plan options** group holds **Approve** — sending `ok` to that same session — plus **start work** rows (`start work`, `start work --make-pr`, `start work --ship`) that launch the OMO plan in the current session. Approval rows also show the planner session state as a plain-text suffix — `working` (streaming), `waiting` (awaiting a background task), `idle`, `archived` or `unknown`. When `.omo/` is absent the approval section is simply gone; the question queue works on OpenCode alone.

## ▤ OMO works, boulder and docs

> When the project has oh-my-openagent — its `.omo/omo.jsonc` config marker — a second group appears below the core:
>
> ```
> OMO | Works | Boulder | Docs
> ```
>
> Without the marker the group is gone — no warning, no empty chrome. An installed omo with no active run still shows the group with empty **Works** and **Boulder** (`• none`, `• no active work`); the moment `boulder.json` appears the rows fill in. **Works** lists boulder runs. **Boulder** is the active run: plan, elapsed time, current task, bound sessions. **Docs** indexes the plan, drafts, notepads and evidence; click a text file to preview it. Click **OMO** to fold the group to one summary line.

## ◴ Where the time actually goes

> **Perf** splits the wall clock into wait, think, stream and tools, then ranks models and slow calls. Click a phase, a section title, or a tool row for a dated column log. The scan runs only while this tab is open.

## ▣ Two groups, seven views

> ```
> OES | My work | Project | Session | Perf
> OMO | Works | Boulder | Docs
> ```
>
> **My work** is the queue of things waiting on you — open questions and pending plan approvals. **Project** is the project-wide view — recent sessions plus the tools and files every one of them touched. **Session** is this agent, its delegates, tools and files. **Perf** is timing. Tabs and folds are remembered. Clickable labels underline on hover.

## ⇕ Rows that fit the window

> `oes.json` row counts are ceilings. A short terminal trims live activity last, then Files, then Delegates and OMO. The Tool Calls feed shows the latest `toolRows` and ends in a clickable `… +N more` that reveals another `toolRows` per click (up to `toolFetch`); the Sessions list shows `sessionRows` and reveals four more per click (up to `sessionFetch`); a trimmed Files list ends in a `… +N more` that expands to every file.

## ⊘ Privacy first

> The panel never shows prompts, tool arguments, outputs, patch bodies, or absolute paths. The database is opened read-only. What you see is names, counts, statuses and durations.

## ∅ One dependency

> One runtime package — [`ignore`](https://www.npmjs.com/package/ignore), a gitignore parser with zero transitive dependencies. SQLite comes from `bun:sqlite` or `node:sqlite`; everything else is an OpenCode peer you already have.

## Legend

The glyph says *what* is happening; the colour says *how fresh* it is. Both come from your OpenCode theme.

**Glyphs**

| Glyph                           | Meaning                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `⠋ ⠙ ⠹ ⠸ ⠼ …`                   | working — the same braille spinner OpenCode uses for thinking |
| `↑`                             | waiting for the model                                         |
| `↓`                             | tokens streaming in                                          |
| `→`                             | a tool call in flight                                          |
| `•`                             | idle — finished or archived                                  |
| `◷`                             | queued — waiting for a concurrency slot                       |
| `▾`                             | group header (`▼` is the section fold)                       |
| `×`                             | failed                                                        |
| `✓` `◷` `║` `⊘` `○`             | Works: done / waiting / paused / abandoned / unknown        |
| `?` `!`                         | My work: awaiting an answer / pending approval               |
| `M` `A` `D` `R` `C` `U` `T` `?` | Files: git status — same letters as `git status --short`      |
| `V`                             | Files: viewed (session read only)                             |
| `∴`                             | Perf: thinking                                                 |
| `█░`                            | Perf: share of the wall clock                                  |
| `▁▂▃▄▅▆▇█`                      | Perf: sparkline over recent turns                               |

Arrows blink about twice per second — only the glyph, not the text. They expire on their own (`↓` ~2 s, `↑` 15 s, `→` 30 s) unless the session is still busy. A failed or finished row shows `×` or `•`, never a direction. A queued delegate shows `◷` in warning yellow — it is waiting for a slot, not done.

**Colours**

| Colour                 | Theme key                   | Meaning                                          |
| ---------------------- | --------------------------- | ------------------------------------------------ |
| green                  | `success`                   | receiving tokens, or active within the last 5 s  |
| yellow                 | `warning`                   | waiting on the model, queued work, or last seen 5–10 s ago |
| accent                 | `primary`                   | tool in flight — also the current row            |
| red                    | `error`                     | failed                                           |
| muted                  | `textMuted`                 | idle, done or archived                           |
| green `+N` / red `−M`  | `diffAdded` / `diffRemoved` | added and removed lines                          |
| yellow `M` `R` `C` `T` | `warning`                   | Files: modified / renamed / copied / typechange  |
| red `D` `U`            | `error`                     | Files: deleted or unmerged                       |
| green `A`              | `success`                   | Files: added                                     |
| muted `?` `V`          | `textMuted`                 | Files: untracked, or viewed                      |
| accent `∴`             | `primary`                   | Perf: thinking                                   |

While an arrow is lit it drives the colour. The current session is **bold**. Clickable labels **underline on hover**. On Perf the same arrows mean measured time: wait, stream, tools.

## Install

Add the plugin to `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["file:///path/to/opencode-extended-sidebar"]
}
```

Restart the OpenCode TUI. The panel appears in the sidebar and starts reading your existing session history.

> **Note:** TUI plugins are loaded from `tui.json`, not from a project's `opencode.json`.

## Configuration

Later files win:

1. the plugin's own `oes.json` (defaults)
2. `~/.config/opencode/oes.json` (respects `XDG_CONFIG_HOME`)
3. `<project>/oes.json`

```json
{
  "fileRows": 8,
  "lineMax": 31,
  "omoRows": 8,
  "perfHistory": 3,
  "perfRows": 5,
  "perfTurns": 120,
  "sessionRows": 6,
  "sessionFetch": 20,
  "skipGitignore": false,
  "toolRows": 5,
  "toolFetch": 20
}
```

| Key             | Default                          | What it controls                                      |
| --------------- | -------------------------------- | ----------------------------------------------------- |
| `fileRows`      | `8`                              | most file rows shown                                  |
| `lineMax`       | `31`                             | max characters per row                                |
| `omoRows`       | `8`                              | most OMO rows; `0` keeps the group folded               |
| `perfHistory`   | `3`                              | sessions under Perf → History; `0` hides it          |
| `perfRows`      | `5`                              | rows per Perf section                                  |
| `perfTurns`     | `120`                            | recent turns Perf measures                            |
| `sessionRows`   | `6`                              | sessions shown before the `… +N more` revealer |
| `sessionFetch`  | `20`                             | sessions fetched for the switcher window; distinct from `sessionRows` |
| `skipGitignore` | `false`                          | also honour the project's root `.gitignore` (`.oesignore` is always honoured) |
| `toolRows`      | `5`                              | most tool-call rows shown; the `… +N more` control reveals another `toolRows` per click |
| `toolFetch`     | `20`                             | tool-call history kept behind the `… +N more` revealer; distinct from `toolRows` |

Row counts are ceilings: a short terminal trims below them. Changes apply on the next refresh — no restart.

Ignored files come from `.oesignore` and, when enabled, `.gitignore` — both at the project root, both in gitignore format. The plugin ships a default `.oesignore`.

## Debug

Set `OES_DEBUG_OPENCODE` in the environment **before** starting OpenCode, then restart the TUI.

```bash
# writes to <plugin>/logs/oes-debug-YYYY-MM-DD.log
OES_DEBUG_OPENCODE=1 opencode
```

```powershell
$env:OES_DEBUG_OPENCODE = "1"
opencode
```

`1`, `true`, `yes`, or `on` use the plugin's `logs/` directory. Any other non-empty value is treated as a directory path. `0`, `false`, `no`, or `off` turns it off. Lines are JSON (`ts`, `tag`, `msg`, optional `data`) — path resolution, monitor emits, Perf reads. Logging never crashes the panel.

## How it works

The panel is a read-only view of data OpenCode already stores.

| Source          | Path                                                          | Used for                         |
| --------------- | ------------------------------------------------------------- | -------------------------------- |
| OpenCode SQLite | `~/.local/share/opencode/opencode.db` (or `OPENCODE_DB`) | sessions, tools, files, timings  |
| OMO             | `<project>/.omo/`                                            | works, boulder, docs — optional |
| `oes.json`      | plugin / user config / project                                 | display limits                    |
| ignore files    | `<project>/.oesignore` (always) · `.gitignore` (with `skipGitignore`) | files hidden from the panel     |

It refreshes from database stamps, file watches, and OpenCode events. Cost is shown only when the provider reports it.

## Contributing

Issues and pull requests are welcome. Constraints: read-only OpenCode data, no prompts or tool I/O in the UI, every row must survive a narrow terminal.

Every commit patch-bumps `package.json` and prepends one English sentence to [CHANGELOG.md](CHANGELOG.md). Write that sentence as the first line of the commit message.

`bun test` runs unit and fixture tests. `bun run typecheck` checks types with `tsc --noEmit`. `bun run bench` times the 5k-part scan.

## License

MIT. Copyright © 2026 [pleware](https://github.com/pleware).

<p>
  <a href="https://github.com/pleware"><img src="https://raw.githubusercontent.com/pleware/opencode-extended-sidebar/main/assets/branding.pware.png" alt="pware" width="72" /></a>
</p>

## Acknowledgements

This plugin started as a TUI take on the same idea as [Phrouros](https://github.com/disaeye/phrouros) — a live view of OpenCode agents, delegates and session activity, only inside the sidebar instead of a browser. Thank you to [disaeye](https://github.com/disaeye) for Phrouros.
