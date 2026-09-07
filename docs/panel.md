# Panel reference

Public face of the repo is [README.md](../README.md). This file is the
sidebar: tabs, glyphs, `oes.json`, and debug.

## Tabs

```
• My work  • Session  • Project  • Stats
```

| Tab | Shows |
| --- | --- |
| **My work** | Queue waiting on you: open questions, recent sessions (`switch` / `new`), OMO plan approvals, plus `Draft docs` and `Plans` archives |
| **Session** | This agent, its delegates, tools, files, and — with OMO — drafts this session wrote (last five inline, then a `view all` picker) |
| **Project** | Tools and files every recent session touched |
| **Stats** | Timing |

| Chrome | |
| --- | --- |
| Status lights | `Session`, `Project`, and `Stats` stay a muted `•`. **My work** becomes `?` / `×` / `!` / `▶` / `⊘` when something is waiting now |
| Ended failures | History only — listed under Errors once My work is open; they never light the tab |
| Refresh | Project-wide scan on each DB snapshot (≈1 s), with a 5-second periodic floor. Tabs and folds are remembered |
| Loading row | Braille spinner + `switching · <id>` during a session switch, `loading` on a cold tab, or an error/empty note (`no turns yet` on Stats). Goes away when data lands |
| Row ceilings | `oes.json` counts are maxima. A short terminal trims live activity last, then Files, then Delegates. Lists end in a clickable `… +N more` |
| File lists | Header `view all` instead of an inline revealer. Row text is clipped to the measured column width (wcwidth) |

## Session switcher

Recent sessions live in **My work** as the `Sessions` group.

| Feature |
| --- |
| Title, age, and whether the session is still alive |
| Current session tagged `[C]` |
| Header `switch` opens the host session switcher (same as `/sessions`) |
| Header `new` jumps to the home prompt — native composer with `/` autocomplete, `@` mentions, and the agent/model picker |
| Command palette: `nw`. Slash autocomplete: `/nw` (alias `/new`) |
| Empty sessions that were never prompted are hidden |
| A trimmed group ends in a clickable `… +N more` |
| **Project** rolls up tools and files from the same recent sessions |

## Live activity pulse

| Feature |
| --- |
| Two glyphs per live row: **state** first, then **direction** while one is active |
| State: braille spinner while working, `•` idle, `⧗` queued, `×` failed |
| Direction: **→** tool in flight, **←** tokens streaming in, **◷** waiting on the model |
| Direction blinks about twice a second; colours come from the OpenCode theme |
| Idle rows leave the direction slot blank |

## Tool calls

| Feature |
| --- |
| Each row is labelled with what ran — command, file, pattern, or task — plus duration |
| Running calls tick live; failures show `×` |
| Click a tool for a metadata sheet (never args or output) |
| **Project** carries the same feed rolled up from recent sessions |
| Shows the latest `toolRows` (default 5); `… +N more` reveals the next batch, up to `toolFetch` (default 20) |

## File changes

| Feature |
| --- |
| Files this session touched, with `+N −M` and git letters (`M` `A` `D` `R` `C` `U` `T` `?`) |
| `V` means viewed — a session read with no git status |
| Click Markdown for a scrollable preview; other files open a native picker — **Preview** or **Copy relative path** |
| **Project** merges the same list across recent sessions |
| Header carries a `view all` action |
| Scratch dirs (`tmp/`, `.tmp/`, `.omo/`) and boilerplate filenames are hidden via the plugin's default `.oesignore` |
| The project's `.oesignore` (gitignore format) is honoured when present; `skipGitignore` also honours the project's `.gitignore` |

## Delegates

| Feature |
| --- |
| When an orchestrator hands work off, delegates appear as their own rows — tokens, status, pulse, click to jump |
| **Project** lists the project's boulder |
| **Session** lists only this session's children |

## My work

| Feature |
| --- |
| One queue of things that need **your** action, shown first in the core group |
| Open `question` tools anywhere in the project appear as rows |
| Three states: `?` **Awaiting answer**, `⊘` **Interrupted**, `×` **Errors** |
| Interrupted and Errors rows open a picker: **Navigate to session** / **Dismiss** |
| Dismissed questions have their own group |
| `Sessions` group (`◔`) — every recent session, live or idle |
| Sessions idle 48–72 hours render dimmed; past 72 hours they are hidden |
| `Pinned` sits ahead of the queue — `P` pins a session up, `U` sends it back. Pins live in kv `oes.config`, not `oes.json` |
| OMO groups: `Ready to review`, `Ready to start`, `Finished`, `Drafting`, `Draft docs`, `Plans` |
| When `.omo/` is absent the approval section is gone; the question queue works on OpenCode alone |

## Stats

| Feature |
| --- |
| **Perf** splits the wall clock into wait, think, stream, and tools, then ranks models and slow calls |
| Click a phase, a section title, or a tool row for a dated column log |
| The scan runs only while this tab is open |
| **OES bar**: braille spinner while a tab loads or a session switch is in flight; `×` on a real error |
| When quiet: 8-column block bar plus an integer **tok/s** estimate |
| **`C`** opens the **charts** popup (Tok / Cache / Proc / Net) |
| Cold start: one-row `engage` boot line, then the `Loaded. Engage!` toast |
| Muted **self** line (`self 0.4ms/ev · 1.2ms/sc · 59fps`) is diagnostic only — shown when `OES_DEBUG_OPENCODE` or `OES_DEBUG_PROFILE` is active |

## Legend

The glyph says *what* is happening; the colour says *how fresh* it is. Both come from the OpenCode theme.

**Glyphs**

| Glyph | Meaning |
| --- | --- |
| `⠋ ⠙ ⠹ ⠸ ⠼ …` | working — the same braille spinner OpenCode uses for thinking |
| `◷` | waiting on the model (direction glyph — blinks) |
| `→` | tool in flight (direction glyph — blinks) |
| `←` | tokens streaming in (direction glyph — blinks) |
| `•` | idle — finished or archived |
| `⧗` | queued — waiting for a concurrency slot |
| `▾` | group header (`▼` is the section fold) |
| `×` | failed |
| `?` `⊘` `×` `◔` `!` `…` `•` `▸` `▶` `✓` | My work: awaiting / interrupted / errors / running / ready to review / drafting / draft docs / plans / ready to start / finished |
| `✓` `!` `?` `·` | Review lanes: approved / changes requested / inconclusive / waiting |
| `M` `A` `D` `R` `C` `U` `T` `?` | Files: git status — same letters as `git status --short` |
| `V` | Files: viewed (session read only) |
| `[C]` | Sessions: the current session |
| `∴` | Perf: thinking |
| `█░` | Perf: share of the wall clock |
| `▁▂▃▄▅▆▇█` | Perf: trend line chart |

| Timing | |
| --- | --- |
| Working spinner | Separate fast glyph tick (80 ms) |
| Direction expiry | ~2 s receiving tokens, ~15 s waiting on the model, ~30 s after a tool call — unless the session is still busy |

**Colours**

| Colour | Theme key | Meaning |
| --- | --- | --- |
| green | `success` | receiving tokens, or active within the last 5 s |
| yellow | `warning` | waiting on the model, queued work, or last seen 5–10 s ago |
| accent | `primary` | tool in flight — also the current row |
| red | `error` | failed |
| muted | `textMuted` | idle, done or archived |
| green `+N` / red `−M` | `diffAdded` / `diffRemoved` | added and removed lines |
| `A` green / `D` red / `M` yellow | `success` / `error` / `warning` | Files: git-status letter by state |

While an arrow is lit it drives the colour. The current session is **bold** and tagged `[C]`. Clickable labels **underline on hover**.

## Configuration

Later files win:

1. the plugin's own `oes.json` (defaults)
2. `~/.config/opencode/oes.json` (respects `XDG_CONFIG_HOME`)
3. `<project>/oes.json`

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

| Key | Default | What it controls |
| --- | --- | --- |
| `fileRows` | `8` | most file rows shown |
| `perfHistory` | `3` | sessions under Perf → History; `0` hides it |
| `perfRows` | `5` | rows per Perf section |
| `perfTurns` | `120` | recent turns Perf measures |
| `questionReconcileSec` | `15` | seconds between full open-question rescans when no live hint arrives |
| `sessionDimHours` | `48` | hours after which a still-visible session is dimmed |
| `sessionFetch` | `10` | recent sessions fetched for the My work `Sessions` group |
| `sessionVisibleHours` | `72` | hours a session stays visible after its last update |
| `skipGitignore` | `false` | also honour the project's root `.gitignore` |
| `toolRows` | `5` | most tool-call rows shown |
| `toolFetch` | `20` | tool-call history behind `… +N more` |

Row counts are ceilings. Numeric `oes.json` values are clamped (for example
`fileRows` is 3–20). Changes apply on the next refresh — no restart.

## Debug

Set the variable **before** starting OpenCode, then restart the TUI. While a logger is active the sidebar shows the muted `self` cost line, a yellow flag (`debug mode` / `profile`), the resolved log directory, and a 5-row debug console over a 200-line ring.

```bash
OES_DEBUG_OPENCODE=1 opencode
```

```powershell
$env:OES_DEBUG_OPENCODE = "1"
opencode
```

| Variable | Role |
| --- | --- |
| `OES_DEBUG_OPENCODE` | `1` / `true` / `yes` / `on` → plugin `logs/`. Any other non-empty value is a directory path. `0` / `false` / `no` / `off` turns it off |
| `OES_DEBUG_PROFILE` | Times plugin entry points; writes `<plugin>/logs/oes-profile-YYYY-MM-DD.log` (in this checkout: `./logs`). On unmount appends one `summary` line with per-tag `{ n, total, avg, max }` |

Lines are JSON (`ts`, `tag`, `msg`, optional `data`). Logging never crashes the panel.

## How it works

The panel is a read-only view of data OpenCode already stores.

| Source | Path | Used for |
| --- | --- | --- |
| OpenCode SQLite | `~/.local/share/opencode/opencode.db` (or `OPENCODE_DB`) | sessions, tools, files, timings |
| OMO | `<project>/.omo/` | plan approvals (My work) — optional |
| `oes.json` | plugin / user config / project | display limits |
| ignore files | `<project>/.oesignore` (always) · `.gitignore` (with `skipGitignore`) | files hidden from the panel |

It refreshes from database stamps, file watches, and OpenCode events. The always-on runtime snapshot runs in a Bun worker; if the worker is unavailable, the same gateway runs in the host process. Snapshot, Project, My work and Perf reads are split into ordered layers.

SQLite scheduling: [db-pooling.md](db-pooling.md). Module map: [ARCHITECTURE.md](../ARCHITECTURE.md).
