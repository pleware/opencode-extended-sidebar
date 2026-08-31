# Architecture

OpenCode Extended Sidebar is a read-only OpenCode TUI plugin. It renders a live
mission-control panel in the sidebar from data OpenCode already stores: the
`opencode.db` SQLite database, host events, the optional `.omo/` directory, and
`oes.json` options. One runtime dependency (`ignore`); everything else is an
OpenCode / OpenTUI peer.

This file is the canonical index of the project structure: what lives where,
which layer may import which, and how tests mirror the modules. Code follows
this map — a file that does not fit one of the modules below is misplaced.

## Module map

```
src/
├── pware.oc.ui.tsx                        # plugin entry (registered as ./tui)
├── pware.oc.core/                         # shared infrastructure + pure logic
│   ├── index.ts
│   ├── pware.oc.core.cache.ts
│   ├── pware.oc.core.clipboard.ts
│   ├── pware.oc.core.debug.ts
│   ├── pware.oc.core.events.ts
│   ├── pware.oc.core.layout.ts
│   ├── pware.oc.core.oes.ts
│   ├── pware.oc.core.paths.ts
│   ├── pware.oc.core.preview.ts
│   ├── pware.oc.core.pulse.ts
│   ├── pware.oc.core.sqlite.ts
│   ├── pware.oc.core.status.ts
│   ├── constants/                         # OpenCode host string literals
│   │   ├── index.ts
│   │   ├── pware.oc.core.constants.partType.ts
│   │   ├── pware.oc.core.constants.eventType.ts
│   │   └── pware.oc.core.constants.toolName.ts
│   └── git/                               # project git + ignore rules
│       ├── index.ts
│       ├── pware.oc.core.git.ts
│       └── pware.oc.core.gitignore.ts
├── pware.oc.opencode/                     # OpenCode domain: SQLite + file activity
│   ├── index.ts
│   ├── pware.oc.opencode.files.ts
│   └── resolver/
│       ├── index.ts
│       ├── pware.oc.opencode.resolver.session.ts
│       ├── pware.oc.opencode.resolver.tool.ts
│       ├── pware.oc.opencode.resolver.file.ts
│       ├── pware.oc.opencode.resolver.question.ts
│       └── pware.oc.opencode.resolver.todo.ts
├── pware.oc.omo/                          # oh-my-openagent domain: .omo/.sisyphus files
│   ├── index.ts
│   ├── constants/                         # OMO string literals
│   │   ├── index.ts
│   │   ├── pware.oc.omo.constants.planStatus.ts
│   │   ├── pware.oc.omo.constants.boulderStatus.ts
│   │   ├── pware.oc.omo.constants.backgroundTask.ts
│   │   ├── pware.oc.omo.constants.reviewStatus.ts
│   │   └── pware.oc.omo.constants.verdict.ts
│   └── resolver/
│       ├── index.ts
│       ├── pware.oc.omo.resolver.boulder.ts
│       ├── pware.oc.omo.resolver.plan.ts
│       ├── pware.oc.omo.resolver.approval.ts
│       ├── pware.oc.omo.resolver.approvalState.ts
│       ├── pware.oc.omo.resolver.doc.ts
│       └── pware.oc.omo.resolver.config.ts
├── pware.oc.runtime/                      # runtime composition: opencode + omo
│   ├── index.ts
│   ├── pware.oc.runtime.monitor.ts
│   ├── pware.oc.runtime.mywork.ts
│   └── resolver/
│       ├── index.ts
│       └── pware.oc.runtime.resolver.delegate.ts
├── pware.oc.perf/                         # turn-timing analysis + plugin self-cost
│   ├── index.ts
│   ├── pware.oc.perf.reader.ts
│   ├── pware.oc.perf.self.ts
│   └── pware.oc.perf.view.tsx
└── pware.oc.ui/                           # TUI layer
    ├── index.ts
    ├── pware.oc.ui.chrome.tsx
    ├── pware.oc.ui.sections.tsx
    ├── pware.oc.ui.sidebar.tsx
    ├── pware.oc.ui.menudialogs.tsx
    └── pware.oc.ui.glyphs.tsx
```

## Layers and dependency rules

| Layer | Owns | May import |
|---|---|---|
| `pware.oc.ui` | TUI components, dialogs, glyphs | anything below |
| `pware.oc.perf` | timing reader + view | core |
| `pware.oc.runtime` | snapshot composition, monitor, my-work queue | opencode, omo, core |
| `pware.oc.opencode` | OpenCode data source | core |
| `pware.oc.omo` | OMO data source | core |
| `pware.oc.core` | shared infra, pure helpers, git | **nothing** |

Rules:

- A module imports only from its own layer or below. **`core` never imports a
  domain or the UI.**
- A domain = one data source. `opencode` reads SQLite + host events; `omo`
  reads `.omo/` / `.sisyphus/` files. Neither reads the other's data.
- `runtime` is the only place that composes the two domains into one snapshot.
  `monitor.ts` lives here because it watches boulder (omo) and drives
  `readRuntimeSnapshot` (runtime).
- The panel renders; it does not re-decide. View rules (glyphs, labels, row
  budgets, folds) live in `core` or `ui` as exported helpers the JSX calls.
- No `core` module imports a `pware.oc.ui.*` module. Formatter data such as
  `SPARK_FRAMES` stays in `pulse.ts`; the glyphs module imports from core, not
  the other way around.

## What lives where

### `pware.oc.ui.tsx` — entry

Plugin registration: `id = "opencode-extended-sidebar"`, load toast,
`sidebar_content` slot (order 320) rendering `<SidebarPanel/>`. Referenced by
`package.json` → `exports: { "./tui": "./src/pware.oc.ui.tsx" }`.

### `pware.oc.core` — shared infrastructure

| Module | Responsibility | Key exports |
|---|---|---|
| `cache.ts` | stamp-keyed in-memory cache, optional TTL | `createStampCache()` |
| `clipboard.ts` | OS clipboard, no npm deps | `copyText()`, `osc52Payload()` |
| `debug.ts` | `OES_DEBUG_OPENCODE` JSON-line file logger | `dbg()`, `debugLogDir()`, `resetDebug()` |
| `events.ts` | host event type/kind classification | `eventType()`, `eventKind()`, `shouldRefreshDb()` |
| `layout.ts` | vertical row budget, overflow slicing | `panelRows()`, `packSections()`, `sliceShown()`, `sliceWithOverflow()`, `ROW_MIN`, `ROW_RANK` |
| `oes.ts` | `oes.json` merge + clamp | `OesOptions`, `OES_DEFAULTS`, `pick()`, `getOes()`, `oesStamp()`, `resetOesCache()` |
| `paths.ts` | OpenCode path resolution, path folding | `getOpenCodeDbPath()`, `pluginRoot()`, `resolveProjectFile()`, `basenameOf()`, `fileStamp()`, `dbStamp()`, `str()`, `finiteNum()` |
| `preview.ts` | text/markdown preview limits | `previewViewportRows()`, `canPreviewPath()`, `isMarkdownPath()`, `readTextPreview()` |
| `pulse.ts` | agent marks, flow, time/token formatting | `toEpochMs()`, `pulseAgeMs()`, `composeMark()`, `hottestMark()`, `activeFlow()`, `applyFlow()`, `flowFromEvent()`, `sessionBusyFromEvent()`, `sessionIdFromEvent()`, `shortToolLabel()`, `toolHitFromEvent()`, `formatAge()`, `formatDuration()`, `formatTokens()`, `formatUsd()`, `sparkline()`, `packChips()`, `SPARK_FRAMES` |
| `sqlite.ts` | readonly `bun:sqlite` / `node:sqlite` handle | `openReadonlyDb()`, `withDbRead()`, `resetReadonlyDb()`, `uniqueIds()` |
| `status.ts` | canonical lifecycle/tool/work status | `normalizeStatus()`, `toToolStatus()`, `toWorkLabel()`, `isPendingWork()`, `workIsTerminal()`, `taskRank()` |

### `pware.oc.core/constants` — OpenCode host string literals

| Module | Responsibility | Key exports |
|---|---|---|
| `partType.ts` | `part.data.type` values (SDK `Part` union) | `PART_TYPE_TEXT`, `PART_TYPE_REASONING`, `PART_TYPE_TOOL`, `PART_TYPE_STEP_START`, `PART_TYPE_STEP_FINISH`, `PART_TYPE_SNAPSHOT`, `PART_TYPE_PATCH`, `PART_TYPE_AGENT`, `PART_TYPE_SUBTASK`, `PART_TYPE_RETRY`, `PART_TYPE_COMPACTION`, `PART_TYPE_FILE`, `PART_TYPES`, `PartType` |
| `eventType.ts` | host event `type` strings (SDK `Event` + stream) | per-value `EVENT_*` consts, `EVENT_TYPES`, `EventType` |
| `toolName.ts` | tool names by file-touch + special non-file tools | per-value `TOOL_*` consts, `WRITE_TOOLS`, `READ_TOOLS`, `NON_FILE_TOOLS`, `ToolName` |

### `pware.oc.core/git` — project git + ignore

| Module | Responsibility | Key exports |
|---|---|---|
| `pware.oc.core.git.ts` | read-only porcelain letters for Files | `GitLetter`, `readGitMarksFor()`, `findGitRoot()`, `parsePorcelainZ()`, `relToGitRoot()`, `relsFrom()`, `onGitMarksChange()`, `gitLetterFor()` |
| `pware.oc.core.gitignore.ts` | `.oesignore` (always) + `.gitignore` (opt-in) | `ignoredByOesignore()`, `ignoredByGitignore()`, `gitignoreStamp()`, `gitignorePath()`, `oesignorePath()` |

### `pware.oc.opencode` — OpenCode domain

| Module | Responsibility | Key exports |
|---|---|---|
| `files.ts` | `FileView`: basename + diff stats only | `FileView`, `FileLetter`, `filesFromEvent()`, `filesFromPatchJson()`, `fileHitFromExtracted()`, `decorateFiles()`, `mergeFiles()`, `sumDiff()`, `shortFileName()`, `formatDiffStat()` |
| `resolver/session.ts` | session rows → `SessionView`, hierarchy queries | `toSessionView()`, `inferStatus()`, `sessionActivityState()`, `getSessionById()`, `listChildSessions()`, `listRecentMainSessions()`, `getSessionsByIds()`, `sessionScanStamp()`, `sessionForPlanFile()` |
| `resolver/tool.ts` | tool parts → `ToolView`, metadata only | `listToolEvents()`, `listRecentToolEvents()`, `mergeTools()`, `normalizeToolStatus` |
| `resolver/file.ts` | file-touch parts → `FileView` | `listSessionFiles()`, `listRecentSessionFiles()` |
| `resolver/question.ts` | open `question` queue | `listOpenQuestions()` |
| `resolver/todo.ts` | todo rows | `listTodos()` |
| `resolver/index.ts` | aggregate | `readDbSnapshot()`, `emptyDb()`, `readProjectFeed()`, `DbSnapshot`, `ProjectFeed` |

### `pware.oc.omo` — oh-my-openagent domain

| Module | Responsibility | Key exports |
|---|---|---|
| `resolver/boulder.ts` | `boulder.json` → works/tasks/delegates/plan | `readOmo()`, `emptyOmo()`, `findBoulder()`, `findOmoWatchDirs()`, `isOmoPresent()`, `omoStamp()`, `currentTask()`, `workRowView()`, `workStatusLabel` |
| `resolver/plan.ts` | plan markdown frontmatter parsing | `parsePlanStatus()`, `parsePlanPendingAction()`, `parseReviewBlock()`, `approvalName()` |
| `resolver/approval.ts` | approval + drafting scan (TTL, lazy) | `listPendingApprovals()`, `listDraftingApprovals()`, `resetApprovalsCache()` |
| `resolver/approvalState.ts` | planner session state for approval rows | `planSessionStateLabel()`, `enrichApprovalSessionStates()`, `readRunContinuationState()`, `firstRunContinuationDir()` |
| `resolver/doc.ts` | docs index: plan/drafts/notepads/proof | `readOmoDocs()`, `groupDocs()`, `resetDocsCache()`, `DOC_KIND_LABEL` |
| `resolver/config.ts` | `oh-my-openagent.json` team mode | `readOmoConfig()` |
| `resolver/index.ts` | aggregate | barrel |

### `pware.oc.omo/constants` — OMO string literals

| Module | Responsibility | Key exports |
|---|---|---|
| `planStatus.ts` | plan frontmatter `status:` values awaiting sign-off | `PLAN_PENDING_STATUSES`, `PlanPendingStatus` (+ per-value consts) |
| `boulderStatus.ts` | raw boulder.json work/task status values | `BOULDER_STATUSES`, `BoulderStatus` (+ per-value consts) |
| `backgroundTask.ts` | `.omo/run-continuation` background-task state values | `BACKGROUND_TASK_STATES`, `BackgroundTaskState` |
| `reviewStatus.ts` | `ulw-plan` review-lifecycle status values | `REVIEW_STATUSES`, `TERMINAL_REVIEW_STATUSES`, `ReviewStatus`, `ROUND_STATUS_ACTIVE` (+ per-value consts) |
| `verdict.ts` | review lane verdict values | `VERDICTS`, `Verdict` (+ per-value consts) |

### `pware.oc.runtime` — runtime composition

| Module | Responsibility | Key exports |
|---|---|---|
| `pware.oc.runtime.monitor.ts` | watch boulder + poll SQLite stamps, fingerprint-driven | `startMonitor()`, `MonitorHandle` |
| `pware.oc.runtime.mywork.ts` | the "My work" queue (questions + approvals) | `MyWorkItem`, `groupMyWork()`, `approvalGroup()`, `toQuestionItems()`, `toApprovalItems()`, `approvalContinueHint()`, `startWorkCommand()`, `StartWorkMode` |
| `resolver/index.ts` | unified runtime snapshot | `RuntimeSnapshot`, `readRuntimeSnapshot()`, `computeFingerprint()`, `resetRuntimeCache()` |
| `resolver/delegate.ts` | delegate enrichment + grouping | `enrichDelegates()`, `reconcileDelegateStatus()`, `groupDelegates()`, `delegatesForSession()` |

### `pware.oc.perf` — timing analysis + plugin self-cost

| Module | Responsibility | Key exports |
|---|---|---|
| `reader.ts` | wall-clock split per model/tool, dated logs | `readPerfSnapshot()`, `emptyPerf()`, `aggregate()`, `readPerfLog()`, `formatPerfLog()`, `collectPerfLogRows()`, `formatColumns()`, `toolLogCall()` |
| `self.ts` | plugin self-cost: event/scan/tick latency + renderer FPS | `selfTime()`, `readSelfStats()`, `resetSelfStats()`, `setSelfFps()`, `readRendererFps()`, `formatSelfLine()`, `SelfStats` |
| `view.tsx` | Perf tab | `PerfPanel` |

### `pware.oc.ui` — TUI layer

| Module | Responsibility | Key exports |
|---|---|---|
| `chrome.tsx` | shared chrome, theme colours, kv persistence | `BrandTabs`, `ClickText`, `FoldHeader`, `DiffStat`, `textAttrs()`, `kvRead()`, `kvWrite()`, `kvReadOne()`, `kvWriteOne()`, `ThemeColors` |
| `sections.tsx` | shared sidebar primitives: kv-persisted fold state, foldable sections, budget-sliced data groups, brand+tabs+panel columns | `useFold()`, `FoldSection`, `GroupSection`, `TabColumn` |
| `sidebar.tsx` | the panel: groups, tabs, live rows | `SidebarPanel` |
| `menudialogs.tsx` | every popup via one `openDialog()` choke-point | `openFileDetail()`, `openToolDetail()`, `openWorkDetail()`, `openApprovalDialog()`, `openDocDetail()`, `openTextPreview()`, `openPerfLog()` |
| `glyphs.tsx` | status → character mappings | `workStatusGlyph()`, `markGlyph()`, `flowGlyph()`, `spinnerFrame()`, `flowBlinkOn()`, `myWorkGlyph()`, `reviewLaneGlyph()`, `reviewStateSuffix()`, `fileLetterMark()`, `SPINNER_FRAMES`, `GROUP_GLYPH`, `THINK_GLYPH` |

## Tests

`test/` mirrors `src/` one module per file (`tests-sync` rule):

- `test/unit/…` — `bun:test` against exported helpers. Paths and names follow
  the module map above (e.g. `test/unit/pware.oc.core/git/pware.oc.core.git.test.ts`).
- `test/snapshot/sidebar.test.ts` — SQLite + `.omo` fixtures through
  `readRuntimeSnapshot` / `delegatesForSession`.
- `test/bench/scan.test.ts` — 5k-part budgets (fingerprint, snapshot, tools/files, Perf).
- `test/helpers/` — shared fixtures (`project.ts`, `sqlite.ts`) + `assertPrivacy`.

`bun test` runs unit + snapshot; `bun run typecheck` is `tsc --noEmit`; `bun run bench`
runs the scan budgets.

## Root files

| File | Purpose |
|---|---|
| `oes.json` | shipped defaults for `pware.oc.core/oes.ts` |
| `.oesignore` | shipped ignore list for the Files panel |
| `package.json` | npm surface; `exports: { "./tui": "./src/pware.oc.ui.tsx" }` |
| `README.md` / `CHANGELOG.md` | public docs (English) |
| `backlog.md` | local product notes (gitignored) |
| `docs/` | long-form docs |
| `scripts/`, `.githooks/` | commit-bump + docs tooling |
| `test/` | unit / snapshot / bench / helpers |

## Migration (current → target)

The current flat `src/` tree maps 1:1 onto the module map. Content moves
verbatim; the only intended content changes are `SPARK_FRAMES` returning from
`pware.oc.ui.glyphs.tsx` to `pulse.ts` (removes the core→ui edge) and the
full-consistency rename of the runtime symbols to `RuntimeSnapshot`,
`readRuntimeSnapshot`, `resetRuntimeCache`.

| Current | Target |
|---|---|
| `tui.tsx` | `pware.oc.ui.tsx` |
| `cache.ts` | `pware.oc.core/pware.oc.core.cache.ts` |
| `clipboard.ts` | `pware.oc.core/pware.oc.core.clipboard.ts` |
| `debug.ts` | `pware.oc.core/pware.oc.core.debug.ts` |
| `events.ts` | `pware.oc.core/pware.oc.core.events.ts` |
| `layout.ts` | `pware.oc.core/pware.oc.core.layout.ts` |
| `oes.ts` | `pware.oc.core/pware.oc.core.oes.ts` |
| `paths.ts` | `pware.oc.core/pware.oc.core.paths.ts` |
| `preview.ts` | `pware.oc.core/pware.oc.core.preview.ts` |
| `pulse.ts` | `pware.oc.core/pware.oc.core.pulse.ts` |
| `sqlite.ts` | `pware.oc.core/pware.oc.core.sqlite.ts` |
| `status.ts` | `pware.oc.core/pware.oc.core.status.ts` |
| `git.ts` | `pware.oc.core/git/pware.oc.core.git.ts` |
| `gitignore.ts` | `pware.oc.core/git/pware.oc.core.gitignore.ts` |
| `files.ts` | `pware.oc.opencode/pware.oc.opencode.files.ts` |
| `monitor.ts` | `pware.oc.runtime/pware.oc.runtime.monitor.ts` |
| `resolvers/mywork.resolver.ts` | `pware.oc.runtime/pware.oc.runtime.mywork.ts` |
| `resolvers/live/index.ts` | `pware.oc.runtime/resolver/index.ts` |
| `resolvers/live/delegate.resolver.ts` | `pware.oc.runtime/resolver/pware.oc.runtime.resolver.delegate.ts` |
| `resolvers/opencode/index.ts` | `pware.oc.opencode/resolver/index.ts` |
| `resolvers/opencode/*.resolver.ts` | `pware.oc.opencode/resolver/pware.oc.opencode.resolver.*.ts` |
| `resolvers/omo/index.ts` | `pware.oc.omo/resolver/index.ts` |
| `resolvers/omo/approvalState.resolver.ts` | `pware.oc.omo/resolver/pware.oc.omo.resolver.approvalState.ts` |
| `resolvers/omo/*.resolver.ts` | `pware.oc.omo/resolver/pware.oc.omo.resolver.*.ts` |
| `perf.ts` | `pware.oc.perf/pware.oc.perf.reader.ts` |
| `perfview.tsx` | `pware.oc.perf/pware.oc.perf.view.tsx` |
| `chrome.tsx` | `pware.oc.ui/pware.oc.ui.chrome.tsx` |
| `sidebar.tsx` | `pware.oc.ui/pware.oc.ui.sidebar.tsx` |
| `pware.oc.ui.menudialogs.tsx` | `pware.oc.ui/pware.oc.ui.menudialogs.tsx` |
| `pware.oc.ui.glyphs.tsx` | `pware.oc.ui/pware.oc.ui.glyphs.tsx` |
| — (new module) | `pware.oc.ui/pware.oc.ui.sections.tsx` — shared primitives (`useFold`, `FoldSection`, `GroupSection`, `TabColumn`) extracted from `sidebar.tsx` + `perfview.tsx`; no flat-tree counterpart |

All relative imports in `src/` and `test/` are updated in the same move
(`tests-sync`), and `package.json` `exports` repoints at the new entry.
