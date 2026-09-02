<p align="center">
  <img src="https://raw.githubusercontent.com/pleware/opencode-extended-sidebar/main/assets/branding.png" alt="OpenCode Extended Sidebar" width="720" />
</p>

# OpenCode Extended Sidebar | TUI Plugin

**Mission control for your OpenCode agents — right inside the TUI.**

Switch sessions, watch tools run live, see which files changed, and where the time went. No browser, no dashboard, four tiny dependencies.

![OpenCode plugin](https://img.shields.io/badge/OpenCode-TUI%20plugin-000?style=flat-square) ![Runtime deps](https://img.shields.io/badge/runtime%20deps-4-brightgreen?style=flat-square) ![Read only](https://img.shields.io/badge/database-read--only-blue?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)

---

## Demo

**[ demo recording goes here ]**

*A short GIF showing session switching, live tool activity and file diffs.*

---

## Why

OpenCode gives you one conversation at a time. Real work looks different: an orchestrator, delegates, tool calls, and a trail of edited files. Extended Sidebar puts that back on screen. It reads OpenCode's own database — nothing to sync, no daemon. Open the TUI and the panel is there.

## ⇄ Session switcher

> Recent sessions, one click away. Title, age, and whether it is still alive. The current session is tagged `[C]`. The header is `Sessions` — no count — with two labels: `switch` opens the host session switcher (the same `/sessions` command) and `new` starts a fresh session in the current project. When more sessions were fetched, a clickable `… +N more` reveals the next four per click. Below the list, tools and files rolled up from those same recent sessions.

## ⊚ Live activity pulse

> Two glyphs per live row: a **state** glyph first — the braille spinner while working, `•` idle, `⧗` queued, `×` failed — then a **direction** glyph while one is active: **→** while a tool call is in flight, **←** while tokens stream in, **◷** while waiting on the model — blinking about twice a second and coloured by what is happening: green receiving tokens, yellow waiting on the model, accent a tool in flight. Idle rows keep the slot blank so the list stays aligned. Colours come from your OpenCode theme.

## ≡ Tool Calls feed that names things

> Each row is labelled with what actually ran — command, file, pattern, or task — plus how long it took. Running calls tick live; failures show `×`. Click a tool for a metadata sheet (never args or output). **Project** carries the same feed rolled up from the sessions above. The feed shows the latest `toolRows` (default 5) and ends in a `… +N more` control that reveals the next batch with each click, up to `toolFetch` (default 20) rows of history.

## ± File changes with diff stats

> Files this session touched, with `+N −M` and git letters (`M` `A` `D` `R` `C` `U` `T` `?`). **V** means viewed — a session read with no git status. Click Markdown for a scrollable preview; other files open a native picker — **Preview** or **Copy relative path**. **Project** merges the same list across the sessions above. A file list's header carries a `view all` action that opens a searchable picker of every file.
>
> Scratch dirs (`tmp/`, `.tmp/`, `.omo/`) and boilerplate filenames are hidden via the plugin's default `.oesignore`. The project's own `.oesignore` (gitignore format) is honoured automatically when present; set `skipGitignore` to also honour the project's `.gitignore`.

## ⋔ Delegates and sub-agents

> When an orchestrator hands work off, delegates appear as their own rows — tokens, status, pulse, click to jump. **Project** lists the project's boulder. **Session** lists only this session's children.

## ? My work — what is waiting on you

> One queue of things that need **your** action, shown first in the core group. Open `question` tools anywhere in the project appear as rows. Three states: `?` **Awaiting answer** (the agent is live and waiting — click to jump to the session and answer), `⊘` **Interrupted** (the question was aborted — answer never came, the reason shows on the row; once an interrupted question has terminated it is treated as resolved and hidden), and `×` **Errors** (the question tool genuinely failed — collapsed by default, expand for the error text). Interrupted and Errors rows open a picker with **Navigate to session** and **Dismiss** — dismissing hides the row and is remembered for the project. Then a **Running** group (`◔`) — your recent sessions still working or idle, each showing the title and its live status label on a two-glyph row, click to jump straight back in. OMO plans and drafts appear in four foldable groups by the action they need from you. Click a group header to fold it to its count line, and a trimmed group ends in a clickable `… +N more`: `Ready to review` (`!`, plans genuinely waiting for your sign-off), `Ready to start` (`▶`, approved plans you can launch), `Finished` (`✓`, done plans — an approved plan is auto-reconciled to Finished when its boulder work completed, or the writer session's todos are all done) and `Drafting` (`…` rows, drafts still being written — click for a picker: **Navigate to session** jumps to the session that wrote the draft, **Preview plan file** opens it as a preview). Click a plan row for a native, searchable picker: **Navigate to session** jumps to the session that wrote the plan (a muted reason is shown when no session is found), **Docs** opens the draft as a preview, and the **Plan options** group holds **Approve** — sending `ok` to that same session — plus **start work** rows (`start work`, `start work --make-pr`, `start work --ship`) that launch the OMO plan in the current session. Session activity is a row suffix, not a group: `working` (streaming), `waiting` (awaiting a background task), `idle`, `archived` or `unknown`. Review-required plans add the ulw-plan review state `R<round> <momus><independent>`, with per-lane glyphs `✓` approved, `!` changes requested, `?` inconclusive, `…` review live, `·` waiting. When `.omo/` is absent the approval section is simply gone; the question queue works on OpenCode alone.

## ◴ Where the time actually goes

> **Perf** splits the wall clock into wait, think, stream and tools, then ranks models and slow calls. Click a phase, a section title, or a tool row for a dated column log. The scan runs only while this tab is open.
>
> A single **OES status bar** sits at the very top of the panel — `OES • 50 tok/s`. The glyph is a braille spinner while a tab loads or a session switch is in flight, `×` on a real error (with the message), and a static `•` once ready. The trailing number is a **live token-rate estimate**: streaming text deltas are counted (≈ code points ÷ 4) over a rolling 5-second window, so it reads `50 tok/s` while tokens stream in and disappears when idle. No prompt or output text ever leaves the panel — only the count.
>
> A muted **self** line above the tab row — `self 0.4ms/ev · 1.2ms/sc · 59fps` — shows what the plugin itself costs: average event-handler ms, average scan (fingerprint + snapshot) ms, and the TUI renderer's FPS. It measures the plugin's own runtime, not the model's. `OES_DEBUG_OPENCODE=1` additionally writes `self`-tagged JSON lines to the debug log.

## ▣ One group, four views

> ```
> Session | My work | Project | Stats
> ```
>
> **Session** is this agent, its delegates, tools, files and — with OMO — the last five drafts behind a `view all` picker. **My work** is the queue of things waiting on you — open questions and OMO plan approvals grouped by the action they need. **Project** is the project-wide view — recent sessions (Chat history) plus the tools and files every one of them touched. **Stats** is timing. Tabs and folds are remembered. Clickable labels underline on hover. While a tab waits for its data a transient status row sits at its top — a braille spinner with `switching · <id>` while a session switch is in flight, `loading` on a cold tab, or an error/empty note (`no turns yet` on Stats) — and disappears the moment the data lands, so a switch never reads as a broken panel.

## ⇕ Rows that fit the window

> `oes.json` row counts are ceilings. A short terminal trims live activity last, then Files, then Delegates. Every list ends in a clickable `… +N more`: the Tool Calls feed reveals another `toolRows` per click (up to `toolFetch`); the Sessions list reveals four per click (up to `sessionFetch`); My work groups and Delegates reveal more with each click too. File lists (Files, Drafts) drop the inline revealer for a header `view all` that opens a searchable picker of the full list.

## ⊘ Privacy first

> The panel never shows prompts, tool arguments, outputs, patch bodies, or absolute paths. The database is opened read-only. What you see is names, counts, statuses and durations.

## ∅ Four dependencies

> Four runtime packages — [`ignore`](https://www.npmjs.com/package/ignore), [`asciichart`](https://www.npmjs.com/package/asciichart), [`simple-statistics`](https://www.npmjs.com/package/simple-statistics), [`@crafter/charts`](https://www.npmjs.com/package/@crafter/charts) — each with zero transitive dependencies. SQLite comes from `bun:sqlite` or `node:sqlite`; everything else is an OpenCode peer you already have.

## Legend

The glyph says *what* is happening; the colour says *how fresh* it is. Both come from your OpenCode theme.

**Glyphs**

| Glyph                           | Meaning                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `⠋ ⠙ ⠹ ⠸ ⠼ …`                   | working — the same braille spinner OpenCode uses for thinking |
| `◷`                             | waiting on the model (direction glyph — blinks)              |
| `→`                             | tool in flight (direction glyph — blinks)                     |
| `←`                             | tokens streaming in (direction glyph — blinks)                |
| `•`                             | idle — finished or archived                                  |
| `⧗`                             | queued — waiting for a concurrency slot                       |
| `▾`                             | group header (`▼` is the section fold)                       |
| `×`                             | failed                                                        |
| `?` `⊘` `×` `◔` `!` `…` `▶` `✓` | My work: awaiting an answer / interrupted / errors / running / ready to review / drafting / ready to start / finished |
| `✓` `!` `?` `·`                 | Review lanes: approved / changes requested / inconclusive / waiting |
| `M` `A` `D` `R` `C` `U` `T` `?` | Files: git status — same letters as `git status --short`      |
| `V`                             | Files: viewed (session read only)                             |
| `[C]`                           | Sessions: the current session label                           |
| `∴`                             | Perf: thinking                                                 |
| `█░`                            | Perf: share of the wall clock — `@crafter/charts` bar, filled `█` + partial blocks, space-empty |
| `▁▂▃▄▅▆▇█`                      | Perf: trend line chart — `asciichart`, nulls interpolated |

The working spinner animates on a separate fast glyph tick (80 ms) while rows and ages stay on the coarse 300 ms clock, and a direction glyph blinks about twice a second, expiring on its own — it stops after ~2 s receiving tokens, ~15 s waiting on the model, ~30 s after a tool call — unless the session is still busy. The state glyph shows `×` on a failed row and `•` on a finished one; the direction slot shows the glyph only while it is active, staying blank otherwise so every row aligns. A queued delegate shows `⧗` in warning yellow — it is waiting for a slot, not done.

**Colours**

| Colour                 | Theme key                   | Meaning                                          |
| ---------------------- | --------------------------- | ------------------------------------------------ |
| green                  | `success`                   | receiving tokens, or active within the last 5 s  |
| yellow                 | `warning`                   | waiting on the model, queued work, or last seen 5–10 s ago |
| accent                 | `primary`                   | tool in flight — also the current row            |
| red                    | `error`                     | failed                                           |
| muted                  | `textMuted`                 | idle, done or archived                           |
| green `+N` / red `−M`  | `diffAdded` / `diffRemoved` | added and removed lines                          |
| muted `M` `A` `D` `?` `V` | `textMuted`                 | Files: git-status letter — not highlighted       |
| accent `∴`             | `primary`                   | Perf: thinking                                   |

While an arrow is lit it drives the colour. The current session is **bold** and tagged `[C]` in the Sessions list. Clickable labels **underline on hover**. On Perf the same arrows mean measured time: wait, stream, tools.

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

Set `OES_DEBUG_OPENCODE` in the environment **before** starting OpenCode, then restart the TUI. While either logger is active the sidebar shows a flag row above the `self` line — `debug mode` and/or `profile`, one next to the other (yellow). A second muted row prints the **resolved log directory** (`logs <path>`) so you can see exactly where files are being written.

```bash
# writes to <plugin>/logs/oes-debug-YYYY-MM-DD.log
OES_DEBUG_OPENCODE=1 opencode
```

```powershell
$env:OES_DEBUG_OPENCODE = "1"
opencode
```

`1`, `true`, `yes`, or `on` use the plugin's `logs/` directory. Any other non-empty value is treated as a directory path. `0`, `false`, `no`, or `off` turns it off. Lines are JSON (`ts`, `tag`, `msg`, optional `data`) — path resolution, monitor emits, Perf reads, and the `self` tag logs the plugin's own measured latencies. Logging never crashes the panel.

SQLite reads fail fast: `busy_timeout` is 100 ms, so a transient WAL lock no longer freezes the panel — the previous snapshot is kept on screen and a `sql.busy` debug line (with the SQL in `data.q`) is appended so lock contention is visible in the log.

The same semantics power `OES_DEBUG_PROFILE`, which times **every plugin entry point and hotspot** and writes one line per call to `<plugin>/logs/oes-profile-YYYY-MM-DD.log`: `{ ts, tag, ms, data? }`. In this local repo checkout, `<plugin>/logs` means `./logs` at the repository root (not `./src/logs`). Tags: `event` (per event type), `tick`, `render` (the re-render trigger), `requestRender`, `row` (per row built), `scan`, `monitor.emit` (fingerprint + snapshot), `db.snapshot` / `db.feed` / `perf.read`, `sql` (every query, with its SQL in `data.q`), `omo.read` / `omo.stamp` / `omo.config` / `omo.approvals` / `omo.docs`, `mywork.approvals` (the per-approval session lookup), `files.decorate` (git marks), `git`, `remount`, `hydrate`, and the async host calls `rpc.diff` / `rpc.selectSession` / `rpc.newSession` / `rpc.startWork` / `rpc.approve`. When the panel unmounts, one `summary` line with per-tag `{ n, total, avg, max }` is appended — the whole wall-clock split in a single line.

## How it works

The panel is a read-only view of data OpenCode already stores.

| Source          | Path                                                          | Used for                         |
| --------------- | ------------------------------------------------------------- | -------------------------------- |
| OpenCode SQLite | `~/.local/share/opencode/opencode.db` (or `OPENCODE_DB`) | sessions, tools, files, timings  |
| OMO             | `<project>/.omo/`                                            | plan approvals (My work) — optional |
| `oes.json`      | plugin / user config / project                                 | display limits                    |
| ignore files    | `<project>/.oesignore` (always) · `.gitignore` (with `skipGitignore`) | files hidden from the panel     |

It refreshes from database stamps, file watches, and OpenCode events. The always-on runtime snapshot is read off the TUI main thread in a Bun worker (with a synchronous fallback if the worker is unavailable), so SQLite reads never block the UI. Cost is shown only when the provider reports it. The `self` line measures the plugin's own runtime with `performance.now()` and the TUI renderer's native frame stats — no extra data source.

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
