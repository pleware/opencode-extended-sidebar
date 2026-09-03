# Architecture

OpenCode Extended Sidebar is a read-only OpenCode TUI plugin. It renders a live
mission-control panel in the sidebar from data OpenCode already stores: the
`opencode.db` SQLite database, host events, the optional `.omo/` directory, and
`oes.json` options. Four runtime dependencies (`ignore`, `asciichart`, `simple-statistics`, `@crafter/charts`); everything else is an
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
│   ├── pware.oc.core.bus.ts
│   ├── pware.oc.core.glyph.ts
│   ├── pware.oc.core.oes.ts
│   ├── pware.oc.core.paths.ts
│   ├── pware.oc.core.preview.ts
│   ├── pware.oc.core.pulse.ts
│   ├── pware.oc.core.sqlite.ts
│   ├── pware.oc.core.status.ts
│   ├── pware.oc.core.timing.ts
│   ├── constants/                         # host literals + the plugin's own vocabularies
│   │   ├── index.ts
│   │   ├── pware.oc.core.constants.partType.ts
│   │   ├── pware.oc.core.constants.eventType.ts
│   │   ├── pware.oc.core.constants.eventName.ts
│   │   ├── pware.oc.core.constants.toolName.ts
│   │   ├── pware.oc.core.constants.status.ts
│   │   ├── pware.oc.core.constants.pulse.ts
│   │   ├── pware.oc.core.constants.eventKind.ts
│   │   ├── pware.oc.core.constants.rowKind.ts
│   │   ├── pware.oc.core.constants.myWork.ts
│   │   └── pware.oc.core.constants.phase.ts
│   └── git/                               # project git + ignore rules
│       ├── index.ts
│       ├── pware.oc.core.git.ts
│       └── pware.oc.core.gitignore.ts
├── pware.oc.opencode/                     # OpenCode domain: SQLite + file activity
│   ├── index.ts
│   ├── pware.oc.opencode.files.ts
│   ├── pware.oc.opencode.events.ts
│   ├── constants/                         # OpenCode-domain string literals
│   │   ├── index.ts
│   │   ├── pware.oc.opencode.constants.sessionStatus.ts
│   │   ├── pware.oc.opencode.constants.questionKind.ts
│   │   ├── pware.oc.opencode.constants.fileTouch.ts
│   │   └── pware.oc.opencode.constants.eventName.ts
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
│   │   ├── pware.oc.omo.constants.verdict.ts
│   │   ├── pware.oc.omo.constants.docKind.ts
│   │   ├── pware.oc.omo.constants.startWork.ts
│   │   └── pware.oc.omo.constants.eventName.ts
│   └── resolver/
│       ├── index.ts
│       ├── pware.oc.omo.resolver.boulder.ts
│       ├── pware.oc.omo.resolver.plan.ts
│       ├── pware.oc.omo.resolver.planFile.ts
│       ├── pware.oc.omo.resolver.draftFile.ts
│       ├── pware.oc.omo.resolver.notepadsFile.ts
│       ├── pware.oc.omo.resolver.proofFile.ts
│       ├── pware.oc.omo.resolver.rulesFile.ts
│       ├── pware.oc.omo.resolver.runContinuationFile.ts
│       ├── pware.oc.omo.resolver.approval.ts
│       ├── pware.oc.omo.resolver.approvalGroup.ts
│       ├── pware.oc.omo.resolver.approvalState.ts
│       ├── pware.oc.omo.resolver.doc.ts
│       └── pware.oc.omo.resolver.config.ts
├── pware.oc.runtime/                      # runtime composition: opencode + omo
│   ├── index.ts
│   ├── pware.oc.runtime.monitor.ts
│   ├── pware.oc.runtime.source.ts
│   ├── pware.oc.runtime.worker.ts
│   ├── pware.oc.runtime.snapshotClient.ts
│   ├── pware.oc.runtime.mywork.ts
│   ├── pware.oc.runtime.mywork-enrich.ts
│   └── resolver/
│       ├── index.ts
│       └── pware.oc.runtime.resolver.delegate.ts
├── pware.oc.perf/                         # turn-timing analysis + plugin self-cost
│   ├── index.ts
│   ├── pware.oc.perf.reader.ts
│   ├── pware.oc.perf.self.ts
│   ├── pware.oc.perf.charts.ts
│   ├── pware.oc.perf.realtime.ts
│   ├── pware.oc.perf.realtimeBlock.ts
│   ├── pware.oc.perf.realtimeResolver.ts
│   ├── pware.oc.perf.realtimeSampler.ts
│   ├── pware.oc.perf.realtimeCpuRam.ts
│   ├── pware.oc.perf.asciichart.d.ts
│   └── pware.oc.perf.view.tsx
└── pware.oc.ui/                           # TUI layer
    ├── index.ts
    ├── pware.oc.ui.chrome.tsx
    ├── pware.oc.ui.sections.tsx
    ├── pware.oc.ui.sidebar.tsx
    ├── pware.oc.ui.live.tsx
    ├── pware.oc.ui.host.tsx
    ├── pware.oc.ui.menudialogs.tsx
    └── pware.oc.ui.glyphs.tsx
```

## Layers and dependency rules

| Layer | Owns | May import |
|---|---|---|
| `pware.oc.ui` | TUI components, dialogs, glyphs | anything below |
| `pware.oc.perf` | timing reader + view | core + ui (view) |
| `pware.oc.runtime` | snapshot composition, monitor, my-work queue | opencode, omo, core |
| `pware.oc.opencode` | OpenCode data source | core |
| `pware.oc.omo` | OMO data source | opencode, core |
| `pware.oc.core` | shared infra, pure helpers, git | **nothing** |

Rules:

- A module imports only from its own layer or below. **`core` never imports a
  domain or the UI.**
- A domain = one data source. `opencode` reads SQLite + host events; `omo`
  reads `.omo/` / `.sisyphus/` files.
- The dependency lock is **one-way**: `omo` may read `opencode` data — OMO is a
  plugin that runs on top of OpenCode, and this sidebar is omo-optional (it
  works without omo and shows the OMO group only when `.omo/` is present). The
  reverse is forbidden: `opencode` never reads `omo` data.
- `runtime` is where the panel snapshot is composed from both domains. `omo`
  may reach into `opencode` data for its own resolutions (e.g. the plan → session
  index reads the OpenCode DB); `opencode` stays blind to `.omo/`.
- The panel renders; it does not re-decide. View rules (glyphs, labels, row
  budgets, folds) live in `core` or `ui` as exported helpers the JSX calls.
- No `core` module imports a `pware.oc.ui.*` module. Formatter data lives in
  `core`; the glyphs module imports from core, not the other way around.

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
| `debug.ts` | `OES_DEBUG_OPENCODE` / `OES_DEBUG_PROFILE` JSON-line file loggers | `dbg()`, `profile()`, `profileAsync()`, `readProfileStats()`, `writeProfileSummary()`, `debugLogDir()`, `profileLogDir()`, `resetDebug()` |
| `bus.ts` | in-process plugin event bus (`pware.oc.*` / `pware.omo.*` / `pware.oes.*`) | `createEventBus()`, `PwareEvent`, `PwareEventBus` |
| `events.ts` | host event type/kind classification | `eventType()`, `eventKind()`, `shouldRefreshDb()` |
| `layout.ts` | vertical row budget, overflow slicing | `panelRows()`, `packSections()`, `rowsForPlan()`, `sliceShown()`, `ROW_MIN`, `ROW_RANK` |
| `oes.ts` | `oes.json` merge + clamp | `OesOptions`, `OES_DEFAULTS`, `pick()`, `getOes()`, `oesStamp()`, `resetOesCache()` |
| `paths.ts` | OpenCode path resolution, path folding | `getOpenCodeDbPath()`, `pluginRoot()`, `resolveProjectFile()`, `basenameOf()`, `fileStamp()`, `dbStamp()`, `str()`, `finiteNum()` |
| `preview.ts` | text/markdown preview limits | `previewViewportRows()`, `canPreviewPath()`, `isMarkdownPath()`, `readTextPreview()` |
| `pulse.ts` | agent marks, flow, time/token formatting | `toEpochMs()`, `pulseAgeMs()`, `composeMark()`, `hottestMark()`, `activeFlow()`, `applyFlow()`, `flowFromEvent()`, `sessionBusyFromEvent()`, `sessionIdFromEvent()`, `stripSessionPrefix()`, `shortToolLabel()`, `toolHitFromEvent()`, `formatAge()`, `formatDuration()`, `formatTokens()`, `formatUsd()`, `packChips()` |
| `glyph.ts` | every glyph as one char+tone spec; tone keys | `ToneKey`, `GlyphSpec`, `SPINNER_FRAMES`, `spinnerFrame()`, `flowBlinkOn()`, `markTone()`, `stateGlyph()`, `directionGlyph()`, `defaultBodyTone()`, `QUEUED_GLYPH` |
| `sqlite.ts` | readonly `bun:sqlite` / `node:sqlite` handle, fail-fast busy timeout (logs `sql.busy`) | `openReadonlyDb()`, `withDbRead()`, `resetReadonlyDb()`, `uniqueIds()`, `isBusyError()` |
| `status.ts` | canonical lifecycle/tool/work status | `normalizeStatus()`, `toToolStatus()`, `toWorkLabel()`, `workStatusGlyph()`, `workIsTerminal()`, `taskRank()` |
| `timing.ts` | panel clock budgets | `TICK_MS`, `NOW_MS`, `FPS_READ_EVERY_TICKS`, `BLINK_TICKS`, `MONITOR_POLL_MS`, `MONITOR_WATCH_DEBOUNCE_MS`, `EVENT_SCAN_DEBOUNCE_MS` |

### `pware.oc.core/constants` — host literals + the plugin's own vocabularies

| Module | Responsibility | Key exports |
|---|---|---|
| `partType.ts` | `part.data.type` values (SDK `Part` union) | `PART_TYPE_TEXT`, `PART_TYPE_REASONING`, `PART_TYPE_TOOL`, `PART_TYPE_STEP_START`, `PART_TYPE_STEP_FINISH`, `PART_TYPE_SNAPSHOT`, `PART_TYPE_PATCH`, `PART_TYPE_AGENT`, `PART_TYPE_SUBTASK`, `PART_TYPE_RETRY`, `PART_TYPE_COMPACTION`, `PART_TYPE_FILE`, `PART_TYPES`, `PartType` |
| `eventType.ts` | host event `type` strings (SDK `Event` + stream) + sidebar subscription set | per-value `EVENT_*` consts, `EVENT_TYPES`, `EventType`, `PANEL_HOST_TYPES` |
| `eventName.ts` | plugin-owned event names (`pware.oes.*`) | `EV_OES_REFRESH_HINT`, `EV_OES_SNAPSHOT`, `EV_OES_SESSION_SELECT` |
| `toolName.ts` | tool names by file-touch + special non-file tools | per-value `TOOL_*` consts, `WRITE_TOOLS`, `READ_TOOLS`, `NON_FILE_TOOLS`, `ToolName` |
| `status.ts` | the plugin's canonical lifecycle/tool statuses | `STATUS_*`, `CANONICAL_STATUSES`, `CanonicalStatus`, `TOOL_STATUS_*`, `TOOL_STATUSES`, `ToolStatus` |
| `pulse.ts` | the plugin's pulse / flow / mark vocabulary | `PULSE_*`, `PULSES`, `Pulse`, `FLOW_*`, `FLOW_DIRS`, `FlowDir`, `FLOW_HINT_CLEAR`, `FlowHint`, `MARK_*`, `AGENT_MARKS`, `AgentMark` |
| `eventKind.ts` | the plugin's host-event classification buckets | `EVENT_KIND_*`, `EVENT_KINDS`, `EventKind` |
| `rowKind.ts` | the sidebar row taxonomy | `ROW_KIND_*`, `ROW_KINDS`, `RowKind` |
| `myWork.ts` | the "My work" approval groups | `MY_WORK_GROUP_*`, `MY_WORK_GROUPS`, `ApprovalGroupKind` |
| `phase.ts` | Perf wall-clock phases + self-cost phases | `PERF_PHASE_*`, `PERF_PHASES`, `PerfPhase`, `PERF_LOG_KIND_*`, `PerfLogKind`, `SELF_PHASE_*`, `SELF_PHASES`, `SelfPhase` |

### `pware.oc.core/git` — project git + ignore

| Module | Responsibility | Key exports |
|---|---|---|
| `pware.oc.core.git.ts` | read-only porcelain letters for Files | `GitLetter`, `readGitMarksFor()`, `findGitRoot()`, `parsePorcelainZ()`, `relToGitRoot()`, `relsFrom()`, `onGitMarksChange()`, `gitLetterFor()` |
| `pware.oc.core.gitignore.ts` | `.oesignore` (always) + `.gitignore` (opt-in) | `ignoredByOesignore()`, `ignoredByGitignore()`, `gitignoreStamp()`, `gitignorePath()`, `oesignorePath()` |

### `pware.oc.opencode` — OpenCode domain

| Module | Responsibility | Key exports |
|---|---|---|
| `files.ts` | `FileView`: basename + diff stats only | `FileView`, `FileLetter`, `filesFromEvent()`, `filesFromPatchJson()`, `fileHitFromExtracted()`, `decorateFiles()`, `mergeFiles()`, `sumDiff()`, `shortFileName()`, `formatDiffStat()` |
| `events.ts` | host-event translation to OpenCode domain bus events | `hostEventToOcEvents()`, `OcEvent` |
| `resolver/session.ts` | session rows → `SessionView`, hierarchy queries | `toSessionView()`, `inferStatus()`, `isRealSession()`, `sessionActivityState()`, `getSessionById()`, `listChildSessions()`, `listRecentMainSessions()`, `getSessionsByIds()`, `sessionScanStamp()` |
| `resolver/tool.ts` | tool parts → `ToolView`, metadata only | `listToolEvents()`, `listRecentToolEvents()`, `mergeTools()`, `normalizeToolStatus` |
| `resolver/file.ts` | file-touch parts → `FileView` | `listSessionFiles()`, `listRecentSessionFiles()` |
| `resolver/question.ts` | open `question` queue | `listOpenQuestions()` |
| `resolver/todo.ts` | todo rows | `listTodos()` |
| `resolver/index.ts` | aggregate | `readDbSnapshot()`, `emptyDb()`, `readProjectFeed()`, `DbSnapshot`, `ProjectFeed` |

### `pware.oc.opencode/constants` — OpenCode-domain string literals

| Module | Responsibility | Key exports |
|---|---|---|
| `sessionStatus.ts` | session status + activity-state values | `SESSION_STATUS_*`, `SESSION_STATUSES`, `AgentStatus`, `SESSION_STATE_*`, `SESSION_STATES`, `SessionState` |
| `questionKind.ts` | open `question` tool-part kinds | `QUESTION_KIND_*`, `QUESTION_KINDS`, `OpenQuestionKind`, `isWaitingForAnswer()`, `isInterrupted()`, `isQuestionError()` |
| `fileTouch.ts` | file read/write touch kinds | `FILE_TOUCH_*`, `FILE_TOUCHES`, `FileTouch` |
| `eventName.ts` | OpenCode-domain event names (`pware.oc.*`) | `EV_OC_SESSION_ACTIVITY`, `EV_OC_FLOW`, `EV_OC_TOOL_HIT`, `EV_OC_FILES_TOUCHED` |

### `pware.oc.omo` — oh-my-openagent domain

| Module | Responsibility | Key exports |
|---|---|---|
| `resolver/boulder.ts` | `boulder.json` → works/tasks/delegates/plan | `readOmo()`, `emptyOmo()`, `findBoulder()`, `findOmoWatchDirs()`, `isOmoPresent()`, `omoStamp()`, `currentTask()`, `workRowView()`, `workStatusLabel`, `planWorkStateByPlanName()` |
| `resolver/plan.ts` | plan markdown frontmatter parsing | `parsePlanStatus()`, `parsePlanPendingAction()`, `parseReviewBlock()`, `approvalName()` |
| `resolver/planFile.ts` | omo file → writer-session index (reads the OpenCode DB via `SqlDb`); one generic engine for every document kind, plus the plan-file listing | `planSessionIndex()`, `sessionForPlanFile()`, `PlanSessionIndex`, `omoFileIndex()`, `sessionForOmoFile()`, `OMO_FILE_KINDS`, `OmoFileKind`, `OmoFileIndex`, `PlanFile.list()` |
| `resolver/draftFile.ts` | draft-file → writer-session index (thin wrapper over `planFile.ts`) | `draftSessionIndex()`, `sessionForDraftFile()`, `DraftFile.list()` |
| `resolver/notepadsFile.ts` | notepad-file → writer-session index (thin wrapper over `planFile.ts`) | `notepadsSessionIndex()`, `sessionForNotepadFile()`, `NotepadFile.list()` |
| `resolver/proofFile.ts` | evidence (proof) file → writer-session index (thin wrapper over `planFile.ts`) | `proofSessionIndex()`, `sessionForProofFile()`, `ProofFile.list()` |
| `resolver/rulesFile.ts` | rule-file → writer-session index (thin wrapper over `planFile.ts`) | `rulesSessionIndex()`, `sessionForRuleFile()` |
| `resolver/runContinuationFile.ts` | run-continuation file → writer-session index (thin wrapper over `planFile.ts`) | `runContinuationSessionIndex()`, `sessionForRunContinuationFile()` |
| `resolver/approval.ts` | the four "My work" approval buckets (ready-to-review / ready-to-start / finished / drafting; TTL, lazy) | `listApprovals()`, `resetApprovalsCache()` |
| `resolver/approvalGroup.ts` | "My work" approval grouping from OMO plan status + draft path, reconciled against boulder + writer todos | `approvalGroup()`, `isDraftOf()`, `resolveApprovalGroup()`, `planWorkDone()`, `isDrafting()`, `isReadyToReview()`, `isReadyToStart()`, `isFinished()` |
| `resolver/approvalState.ts` | `.omo/run-continuation` background-task marker | `readRunContinuationState()`, `firstRunContinuationDir()` |
| `resolver/doc.ts` | docs index: per-kind listing of plan/drafts/notepads/proof, with session + plan-status filters | `listOmoFiles()`, `ListOmoFilesOptions`, `resetDocsCache()`, `DOC_KIND_LABEL` |
| `resolver/config.ts` | `oh-my-openagent.json` team mode | `readOmoConfig()` |
| `resolver/index.ts` | aggregate | barrel |

### `pware.oc.omo/constants` — OMO string literals

| Module | Responsibility | Key exports |
|---|---|---|
| `planStatus.ts` | plan frontmatter `status:` values: the pending sign-off set plus the plan lifecycle `drafting → awaiting-approval → approved → done` | `PLAN_PENDING_STATUSES`, `PlanPendingStatus`, `PLAN_STATUS_DRAFTING`, `PLAN_STATUS_APPROVED`, `PLAN_STATUS_DONE` (+ per-value consts), `WorkState` |
| `boulderStatus.ts` | raw boulder.json work/task status values | `BOULDER_STATUSES`, `BoulderStatus` (+ per-value consts) |
| `backgroundTask.ts` | `.omo/run-continuation` background-task state values | `BACKGROUND_TASK_STATES`, `BackgroundTaskState` |
| `reviewStatus.ts` | `ulw-plan` review-lifecycle status values | `REVIEW_STATUSES`, `TERMINAL_REVIEW_STATUSES`, `ReviewStatus`, `ROUND_STATUS_ACTIVE` (+ per-value consts) |
| `verdict.ts` | review lane verdict values | `VERDICTS`, `Verdict` (+ per-value consts) |
| `docKind.ts` | OMO document kinds | `DOC_KIND_*`, `DOC_KINDS`, `DocKind` |
| `startWork.ts` | OMO `start work` delivery modes | `START_WORK_*`, `START_WORK_MODES`, `StartWorkMode` |
| `eventName.ts` | OMO-domain event names (`pware.omo.*`) | `EV_OMO_BOULDER_CHANGED`, `EV_OMO_DOCS_CHANGED`, `EV_OMO_CONFIG_CHANGED` |

### `pware.oc.runtime` — runtime composition

| Module | Responsibility | Key exports |
|---|---|---|
| `pware.oc.runtime.monitor.ts` | watch boulder + poll SQLite stamps, fingerprint-driven; emits snapshot + boulder-change events (snapshot read is off-thread via `snapshotClient`) | `startMonitor()`, `MonitorHandle` |
| `pware.oc.runtime.source.ts` | runtime source orchestration: monitor lifecycle + debounced refresh from `pware.oes.*`/`pware.omo.*` hints; shuts the worker down on stop | `startRuntimeSource()`, `RuntimeSourceHandle` |
| `pware.oc.runtime.worker.ts` | Bun Worker entry running `readRuntimeSnapshot` off the TUI main thread | (worker entry) |
| `pware.oc.runtime.snapshotClient.ts` | async snapshot client: lazy singleton worker + sync fallback | `readRuntimeSnapshotAsync()`, `shutdownSnapshotWorker()`, `SnapshotRequestOpts` |
| `pware.oc.runtime.mywork.ts` | the "My work" queue (questions + approvals) | `MyWorkItem`, `groupMyWork()`, `toQuestionItems()`, `toApprovalItems()`, `toRunningItems()`, `dropDismissed()`, `parseDismissed()`, `formatDismissed()`, `approvalContinueHint()`, `startWorkCommand()`, `StartWorkMode` |
| `pware.oc.runtime.mywork-enrich.ts` | planner session state for approval rows (opencode SQLite + omo run-continuation) | `planSessionStateLabel()`, `enrichApprovalSessionStates()` |
| `resolver/index.ts` | unified runtime snapshot | `RuntimeSnapshot`, `readRuntimeSnapshot()`, `computeFingerprint()`, `resetRuntimeCache()` |
| `resolver/delegate.ts` | delegate enrichment + grouping | `enrichDelegates()`, `reconcileDelegateStatus()`, `groupDelegates()`, `delegatesForSession()` |

### `pware.oc.perf` — timing analysis + plugin self-cost

| Module | Responsibility | Key exports |
|---|---|---|
| `reader.ts` | wall-clock split per model/tool, dated logs | `readPerfSnapshot()`, `emptyPerf()`, `aggregate()`, `readPerfLog()`, `formatPerfLog()`, `collectPerfLogRows()`, `formatColumns()`, `toolLogCall()` |
| `self.ts` | plugin self-cost: event/scan/tick latency + renderer FPS | `selfTime()`, `readSelfStats()`, `resetSelfStats()`, `setSelfFps()`, `readRendererFps()`, `formatSelfLine()`, `SelfStats` |
| `charts.ts` | pure chart/stat helpers: null-fill, smoothing, downsampling, ANSI strip, bars, trends, histograms, gauges | `interpolateSeries()`, `smoothSeries()`, `downsampleAvg()`, `stripAnsi()`, `asciiTrend()`, `shareBar()`, `perfStatLine()`, `waitHistogram()`, `shareGauge()`, `shareDonut()` |
| `realtime.ts` | realtime metric samples (tokens/cache/cpu·ram/network) + pure history push/prune | `StatRealtimeSnapshot`, `StatRealtimeSnapshotHistory`, `StatRealtimeTokensSeries`, `StatRealtimeCacheSeries`, `StatRealtimeCpuRamSeries`, `StatRealtimeNetworkSeries`, `STAT_REALTIME_HISTORY_WINDOW_MS`, `sumSeries()`, `emptyStatRealtimeSnapshot()`, `pushStatRealtimeHistory()` |
| `realtimeBlock.ts` | static definition of the OES realtime widget: tabs, selector rows, series readers | `StatRealtimeBlock`, `StatRealtimeTab`, `StatRealtimeRowTab`, `StatRealtimeTabId`, `StatRealtimeSeriesKey`, `seriesValues()`, `STAT_REALTIME_BLOCK` |
| `realtimeResolver.ts` | event-driven per-session delta rates → per-session + aggregate chart series (no DB) | `StatRealtimeResolver`, `StatRealtimeEventTokens`, `mergeRealtimeHistories()`, `interpolateRealtimeHistory()`, `REALTIME_INTERPOLATE_STEP_MS` |
| `realtimeSampler.ts` | subscribes to `session.updated`, extracts token totals, feeds the resolver | `EventDriverSampler`, `RealtimeEventSubscribe`, `extractSessionTokens()` |
| `realtimeCpuRam.ts` | process-level CPU/RAM sampling (built-ins, cross-platform) | `CpuRamSampler`, `CpuRamSamplerOptions`, `CpuRamReading`, `cpuPercent()`, `ramMb()` |
| `asciichart.d.ts` | ambient `asciichart` module typings (plain, ANSI-free output) | `plot()` |
| `view.tsx` | Perf tab | `PerfPanel` |

`reader.ts`, `self.ts`, `realtime.ts`, `realtimeBlock.ts`, `realtimeResolver.ts`, `realtimeSampler.ts` and `realtimeCpuRam.ts` are core-only — they import nothing above core.
`view.tsx` is a TUI component: it may import ui chrome to render the Perf tab.

### `pware.oc.ui` — TUI layer

| Module | Responsibility | Key exports |
|---|---|---|
| `chrome.tsx` | shared chrome, theme colours, kv persistence | `BrandTabs`, `ClickText`, `FoldHeader`, `DiffStat`, `textAttrs()`, `toneColor()`, `kvRead()`, `kvWrite()`, `kvReadOne()`, `kvWriteOne()`, `ThemeColors` |
| `sections.tsx` | shared sidebar primitives: kv-persisted fold state, foldable sections, the base row renderer + budget-sliced `RowList`, brand+tabs+panel columns | `useFold()`, `FoldSection`, `GroupSection`, `RowList`, `MoreReveal`, `useReveal()`, `AgentLine`, `RowData`, `TabColumn` |
| `sidebar.tsx` | the panel: groups, tabs, live rows; consumes plugin event bus | `SidebarPanel` |
| `live.tsx` | host event adapter (`api.event.on`) → plugin event bus (`pware.oc.*`, `pware.oes.*`) | `startHostEventBridge()` |
| `host.tsx` | UI host RPC wrappers (session switch/new session/start-work/approve) | `selectSession()`, `openSessionSwitcher()`, `openNewSessionPrompt()`, `runStartWork()`, `approvePlan()` |
| `menudialogs.tsx` | every popup via one `openDialog()` choke-point | `openFileDetail()`, `openToolDetail()`, `openFileListDialog()`, `openApprovalDialog()`, `openQuestionDialog()`, `openDocDetail()`, `openTextPreview()`, `openPerfLog()` |
| `glyphs.tsx` | domain glyphs (My work kinds, git letters, review lanes) as `GlyphSpec`; re-exports core glyph primitives | `workStatusGlyph()` (re-exported from core), `myWorkGlyph()`, `fileLetterGlyph()`, `reviewLaneGlyph()`, `reviewStateSuffix()`, `GROUP_GLYPH`, `THINK_GLYPH` |

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
