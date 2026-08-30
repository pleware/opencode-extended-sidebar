<p align="center">
  <img src="https://raw.githubusercontent.com/pleware/opencode-extended-sidebar/main/assets/branding.png" alt="OpenCode Extended Sidebar" width="720" />
</p>

# OpenCode Extended Sidebar | TUI Plugin

**Mission control for your OpenCode agents — right inside the TUI.**

Switch sessions, watch tools run live, see exactly which files changed — and find out where the time actually went. No browser, no dashboard, no extra dependencies.

![OpenCode plugin](https://img.shields.io/badge/OpenCode-TUI%20plugin-000?style=flat-square) ![Runtime deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen?style=flat-square) ![Read only](https://img.shields.io/badge/database-read--only-blue?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)

---

## Demo

**[ demo recording goes here ]**

*A short GIF showing session switching, live tool activity and file diffs.*

---

## Why

OpenCode gives you one conversation at a time. Real work looks different: an orchestrator, a few delegates, dozens of tool calls, and a trail of edited files. That context normally lives in your head — or in a second window.

Extended Sidebar puts it back on screen. It reads OpenCode's own SQLite database, so there is nothing to configure, nothing to sync, and no daemon to babysit. Open the TUI and the panel is simply there, updating as your agents work.

## ⇄ Session switcher

> Your recent sessions, always one click away. Each row shows the title, how long ago it moved, and whether it is still alive. Click it and the TUI jumps straight there — no palette, no fuzzy search, no losing your place.

## ⊚ Live activity pulse

> Every row breathes. A braille spinner marks sessions that are working, a dot marks the ones that are idle, and a directional glyph tells you what is happening right now: **↑** waiting on the model, **↓** receiving tokens, **→** a tool is in flight. Colours come from your OpenCode theme, so it looks native in light and dark.

## ≡ Tool feed that names things

> Not another wall of `bash` or `task`. Each tool row is labelled with what actually ran — the command, the file, the search pattern, or the short task description — plus how long it took. Running calls tick up live, failures are marked with `×`. **Click a tool** for a metadata sheet (label, duration, status — never args or output).

## ± File changes with diff stats

> See which files this session touched, with `+N −M` per file and a running total in the section header. Letters follow `git status --short` exactly: **M** modified, **A** added, **D** deleted, **R** renamed, **C** copied, **U** unmerged, **T** typechange, **?** untracked. The only extra letter is **V** (viewed) — git does not use it — for a session read with no git status. Git is asked only about those listed paths, and only while the Files section is open on the Current tab. If there is no repo or no `git` binary, git letters stay off and only **V** appears on reads. Additions are green, deletions are red, both pulled from your theme's diff colours. Long names are shortened intelligently (`start…end.ext`) so the panel stays narrow. **Click a Markdown file** to open a formatted, scrollable preview (wheel / arrows; Copy path / Close stay under the document). Other files open a detail sheet first.
>
> Scratch paths are dropped by default (`tmp/`, `.tmp/`). They never appear in the list and they do not count towards the header total. Override the list with `skipDirs` in `oes.json`, or set it to `[]` to show everything. Set `skipGitignore` to `true` to also hide files that match the project's root `.gitignore`.

## ⋔ Delegates and sub-agents

> When an orchestrator hands work off, the delegates show up as their own rows — tokens, status, live pulse, and a click to jump into any of them. Two or more agent names become group headers (`▾ oracle (6)`); a single agent stays a flat list. **Sessions** lists the project's boulder. **Current** lists only children of the current session — a new main session starts empty, even if `.omo/boulder.json` still has yesterday's tasks. A leftover boulder `running` does not keep the spinner up once the OpenCode session has gone idle.

## ▤ OMO plans

> When the project has oh-my-openagent, a second header line appears under OES:
>
> ```
> OMO | Plans
> ```
>
> **Plans** lists the latest boulder works by name and status (active first, then newest). A row with a session is a click to jump there; a row without opens plan metadata and can preview the plan markdown file (formatted and scrollable, not raw). Without `.omo/` the line is gone — no warning, no empty OMO chrome. The checklist itself stays out of the sidebar list.

## ◴ Where the time actually goes

> A session that feels slow is rarely slow for the reason you assume. **Perf** splits the wall clock into the four things that can eat it — **↑** waiting for the model to answer, **∴** thinking, **↓** streaming tokens back, **→** tool calls — and draws each as a bar with its share and its total. Whatever the phases do not claim is idle.
>
> Every model you used gets a row: turns, average time to first token, average thinking time, average streaming time, and output tokens per second. Mixing a fast model and a slow one in the same session stops being a guess. Under it, tools are ranked by the time they burned, not by how often they ran, so a single 2-minute call outranks fifty instant greps. Two sparklines show whether latency and throughput are drifting over the last turns, and **History** puts the same numbers next to your other recent sessions.
>
> While the agent is working, the top line names the phase it is in right now and counts up, so you can watch a stall happen instead of reconstructing it afterwards.
>
> The numbers are measured, not estimated: each turn's timestamps come from its own message and parts. Perf reads more of the database than the other tabs, so it only runs while you are looking at it.

## ▣ Three focused views

> One header line, three scopes — and a second line when OMO is present:
>
> ```
> OES | Sessions | Current | Perf
> OMO | Plans
> ```
>
> **Sessions** is the project view: where you are, where you have been, who else is running. **Current** is the deep view: this agent, the delegates it spawned (not the project's leftover boulder), its tools, its files. **Perf** is the timing view. **Plans** is the OMO view: recent works and their status. Your choice is remembered between restarts, as is every collapsed section. Clickable labels — tabs, fold headers, session rows — are underlined.

## ⊘ Privacy first

> The sidebar never renders prompts, tool arguments, tool outputs, patch bodies, or absolute paths in the panel list. Detail dialogs may show a **project-relative** path on click. It opens OpenCode's database strictly read-only (`PRAGMA query_only`) and never writes a byte back. What you see is metadata: names, counts, statuses, durations. Perf goes one step further and pulls its timings through `json_extract`, so message text and tool output never even leave SQLite.

## ∅ Zero dependencies

> No npm packages at runtime. SQLite comes from `bun:sqlite` or `node:sqlite`, and everything else is an OpenCode peer package you already have. Installing the plugin cannot bloat or break your toolchain.

## Legend

Every row is one glyph plus one colour: the glyph says *what* is happening, the colour says *how fresh* it is. Both come straight from your OpenCode theme, so a row never invents a colour your terminal does not already use.

**Glyphs**


| Glyph                           | Meaning                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `⠋ ⠙ ⠹ ⠸ ⠼ …`                   | working — the same braille spinner OpenCode uses for thinking |
| `↑`                             | request is out, waiting for the model                         |
| `↓`                             | tokens are streaming in                                       |
| `→`                             | a tool call is in flight                                      |
| `•`                             | nothing in progress — finished, queued or archived            |
| `▾`                             | Delegates: agent group header (`▼` is the section fold)       |
| `×`                             | failed — an errored session, delegate or tool call            |
| `M` `A` `D` `R` `C` `U` `T` `?` | Files: git status — same letters as `git status --short`      |
| `V`                             | Files: viewed (session read only) — not a git letter          |
| `∴`                             | Perf: thinking — reasoning time and reasoning tokens          |
| `⧉`                             | Perf: cache hit rate — cached input vs input actually sent    |
| `█░`                            | Perf: share of the wall clock, or of total tool time          |
| `▁▂▃▄▅▆▇█`                      | Perf: sparkline over recent turns — `·` is a turn with no reading |


The three arrows blink about twice per second, and only the glyph blinks — the text next to it stays still, so movement in the panel always means live traffic. Arrows also expire on their own: `↓` fades ~2 s after the last token, `↑` after 15 s, `→` after 30 s, unless the session is still reported as busy. A terminal state always wins over an arrow, so a failed or finished row shows `×` or `•` and never a direction.

**Colours**


| Colour                 | Theme key                   | Meaning                                          |
| ---------------------- | --------------------------- | ------------------------------------------------ |
| green                  | `success`                   | receiving tokens, or active within the last 20 s |
| yellow                 | `warning`                   | waiting on the model, or last seen 20–40 s ago   |
| accent                 | `primary`                   | tool in flight — also the row you are sitting in |
| red                    | `error`                     | failed                                           |
| muted                  | `textMuted`                 | idle, done or archived                           |
| green `+N` / red `−M`  | `diffAdded` / `diffRemoved` | added and removed lines per file, and the total  |
| yellow `M` `R` `C` `T` | `warning`                   | Files: modified / renamed / copied / typechange  |
| red `D` `U`            | `error`                     | Files: deleted or unmerged                       |
| green `A`              | `success`                   | Files: added                                     |
| muted `?` `V`          | `textMuted`                 | Files: untracked, or viewed (not a git letter)   |
| accent `∴`             | `primary`                   | Perf: thinking time and reasoning tokens         |


Direction beats freshness: while an arrow is lit it drives the colour, so `↑` reads yellow even on a session that was busy a millisecond ago. The session you are currently in is additionally **bold**, which is how you tell it apart from any other accent-coloured row. Anything you can click — a tab, a fold header, a session or plan row — is **underlined**.

The three arrows keep their meaning under **Perf**, where they label measured time instead of live traffic: `↑` is time waiting for the first token, `↓` is time spent streaming, `→` is time inside tool calls.

## Install

Add the plugin to `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["file:///path/to/opencode-extended-sidebar"]
}
```

Restart the OpenCode TUI. That is the whole setup — the panel appears in the sidebar and starts reading your existing session history immediately.

> **Note:** TUI plugins are loaded from `tui.json`, not from a project's `opencode.json`.

## Configuration

Everything works out of the box. When you want it tighter or roomier, drop an `oes.json` anywhere in the chain below — later files win:

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
  "sessionRows": 4,
  "skipDirs": ["tmp", ".tmp"],
  "skipGitignore": false,
  "toolRows": 8
}
```


| Key             | Default           | What it controls                                                    |
| --------------- | ----------------- | ------------------------------------------------------------------- |
| `fileRows`      | `8`               | file rows shown (the header total still counts every file)          |
| `lineMax`       | `31`              | max characters per row — raise on a wide sidebar, lower if rows wrap |
| `perfHistory`   | `3`               | recent sessions compared under Perf → History; `0` hides it         |
| `perfRows`      | `5`               | rows per Perf section (models, tools, history)                      |
| `perfTurns`     | `120`             | recent turns Perf measures — more history, slower read              |
| `sessionRows`   | `4`               | how many recent sessions the switcher lists                         |
| `skipDirs`      | `["tmp", ".tmp"]` | directory names or relative prefixes hidden from Files              |
| `skipGitignore` | `false`           | also hide Files matching the project's root `.gitignore` (opt-in)   |
| `toolRows`      | `8`               | tool rows shown                                                     |


Every row — agents, sessions, delegates, tools, files — clips to `lineMax`. There is no per-section name width.

Changes are picked up on the next refresh — no restart needed.

## How it works


| Source          | Path                                                          | Used for                                         |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| OpenCode SQLite | `~/.local/share/opencode/opencode.db` (or `OPENCODE_DB_PATH`) | sessions, tokens, cost, tool parts, edited files, turn timings |
| OMO boulder     | `<project>/.omo/boulder.json` (legacy `.sisyphus/`)           | delegates + plan names/status — OMO line hidden when absent |
| `oes.json`      | plugin / user config / project                                | display limits                                   |


The panel stays fresh three ways at once: a ~1.5s poll of database and WAL stamps, `fs.watch` on the relevant directories, and OpenCode's own session, message, tool and diff events. Token and reasoning deltas only move the live arrows — they do not rescan SQLite. A full tools/files read runs when this session's `MAX(part.time_updated)` actually changes.

Tools and files are filtered with `json_extract` on `part.data` — SQLite returns type, tool, timestamps, labels and +/- metadata. The blob itself (prompts, args, outputs, patch bodies) never enters the process. Diff counts come from edit-tool metadata (`additions` / `deletions`). Patch parts contribute file names only.

`skipDirs` is applied in `files.ts` (`asFile`), so live events, SQLite parts and patch `files[]` all drop the same paths. A bare name matches any directory segment (`tmp` hides `project/tmp/scratch.md` and `C:\work\tmp\out.json`). A name with a slash matches a relative prefix (`docs/media` hides `docs/media/demo.gif`). Matching is case-insensitive. A file merely named `tmp.md` still shows. Setting `skipDirs` in a later `oes.json` **replaces** the list — it does not append — so an empty array shows everything, including scratch files. The config stays JSON on purpose: OpenCode already speaks JSON, three files merge without a parser, and a YAML library would be a runtime dependency.

`skipGitignore` is off by default. When on, the root `.gitignore` is also applied — comments, `!` negation, directory-only slashes, `*` / `**`. Nested `.gitignore` files and `.git/info/exclude` are ignored. It stays off because Files lists what the session just touched, and a gitignored file the agent edited is often exactly the one you want to see.

File letters come from `git status --porcelain -- <paths>` for the files already in the Files list, at the git root found by walking up from the session directory. They keep git's meaning: **R** is rename, **U** is unmerged, **?** is untracked. The spawn is skipped while Files is folded or you are not on the Current tab, and it is debounced so indexer noise on Windows does not walk the whole tree. Git runs **asynchronously** — the panel keeps the last letters (or **V** on a first read) until the process returns, so a 1.5 s `git` cannot stall the TUI. A git letter always wins over a session letter. The only extra is **V** (viewed), which git's short status does not use. No `.git`, no `git` on PATH, or a failed spawn: the sidebar stays up and only **V** is used for read-only touches. The name itself stays the basename — no full paths.

Perf times each assistant turn from its own records: waiting is the gap between the message start and its first `text` or `reasoning` part, thinking is the summed length of the `reasoning` parts, streaming spans the `text` parts, and tool time comes from each tool part's own start and end. Phases are measured against the whole window rather than the summed turn durations, because a tool call can outlive the turn that started it. Every one of those fields is pulled with `json_extract`, so SQLite returns numbers and statuses and nothing else. The scan runs **only while the Perf tab is open**. It is cached against this session's `MAX(time_updated)`, not the whole WAL, so streaming on another tab does not keep re-reading parts. History rows refresh at most every ten seconds.

Cost is shown only when the provider reports it. Many gateways record `0`, and the sidebar will not invent a price from an online catalogue.

`oh-my-openagent` is optional enrichment, never a requirement. Without `.omo/` the **OMO | Plans** line is gone, Delegates is hidden, and there are no warnings. Delegate pulse follows the OpenCode session row: a `task_sessions` entry left on `running` is treated as finished once that session is idle.

## Project layout

```text
src/
  tui.tsx       # plugin entry (sidebar_content slot)
  sidebar.tsx   # tabs, foldable sections, rows
  detail.tsx    # file / tool / plan detail dialogs
  clipboard.ts  # copy-to-clipboard helper (no deps)
  chrome.tsx    # brand tabs, fold headers, diff stats, kv persistence
  perfview.tsx  # Perf tab rendering
  perf.ts       # turn timings per model, phase and tool
  monitor.ts    # fs.watch + poll fingerprint
  live.ts       # unified snapshot
  db.ts         # read-only session / tool / file queries
  files.ts      # basenames + diff stats + git letters + V (viewed)
  git.ts        # git status --porcelain (async spawn, last letters until it returns)
  gitignore.ts  # root .gitignore matcher (used when skipGitignore)
  oes.ts        # oes.json options
  pulse.ts      # live/stale detection, flow, tool labels, bars, sparklines
  sqlite.ts     # bun:sqlite | node:sqlite
  paths.ts      # XDG paths / OPENCODE_DB_PATH
  omo.ts        # boulder / delegates / plans
oes.json        # display defaults
test/           # bun:test — unit, SQLite/OMO fixtures, 5k-part bench
```

## Environment


| Variable           | Meaning                                              |
| ------------------ | ---------------------------------------------------- |
| `OPENCODE_DB_PATH` | override the `opencode.db` location                  |
| `XDG_DATA_HOME`    | OpenCode data root parent (default `~/.local/share`) |
| `XDG_CONFIG_HOME`  | parent of `opencode/oes.json` (default `~/.config`)  |


## Roadmap

- Project-wide main-session resolution instead of the current TUI session only
- A compact status strip: running agents, tokens and cost for the whole tree
- Per-agent identity tones
- Cost estimates for providers that report `0`, from OpenCode's own offline models cache rather than the network
- npm release

## Contributing

Issues and pull requests are welcome. The guiding constraints are worth knowing before you open one: read-only access to OpenCode data, no runtime npm dependencies, no prompts or tool I/O in the UI, and every row has to survive a narrow terminal.

Every commit patch-bumps `package.json` and prepends one English sentence to [CHANGELOG.md](CHANGELOG.md). Write that sentence as the first line of the commit message. Merges and `SKIP_OES_BUMP=1` skip the bump.

`bun test` runs unit and fixture tests (`test/unit`, `test/snapshot`). `bun run bench` times the 5k-part scan — fingerprint, live snapshot hit/miss, tools/files, Perf — and fails if it exceeds the budgets in `test/bench`. Git is not in those budgets: it is spawned off the TUI thread. No extra npm dependencies — `bun:test` and `bun:sqlite` are enough.

## License

MIT. Copyright © 2026 [pleware](https://github.com/pleware).

<p>
  <a href="https://github.com/pleware"><img src="https://raw.githubusercontent.com/pleware/opencode-extended-sidebar/main/assets/branding.pware.png" alt="pware" width="72" /></a>
</p>

## Acknowledgements

This plugin started as a TUI take on the same idea as [Phrouros](https://github.com/disaeye/phrouros) — a live view of OpenCode agents, delegates and session activity, only inside the sidebar instead of a browser. The data model, the pulse, and the decision to stay strictly read-only all come from there. Thank you to [disaeye](https://github.com/disaeye) for Phrouros, and for publishing it so this could exist.