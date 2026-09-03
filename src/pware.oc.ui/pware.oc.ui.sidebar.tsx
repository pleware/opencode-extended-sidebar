/** @jsxImportSource @opentui/solid */
import { createEffect, createMemo, createSignal, For, on, Show, onCleanup, type JSX } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import type { TuiPluginApi, TuiTheme } from "@opencode-ai/plugin/tui"
import {
  DraftFile,
  emptyOmo,
  listApprovals,
  sessionForPlanFile,
} from "../pware.oc.omo/resolver/index.js"
import {
  delegatesForSession,
  groupDelegates,
  type RuntimeSnapshot,
} from "../pware.oc.runtime/resolver/index.js"
import {
  MY_WORK_ORDER,
  approvalContinueHint,
  dropDismissed,
  groupMyWork,
  myWorkLabel,
  toApprovalItems,
  toQuestionItems,
  toRunningItems,
  type MyWorkItem,
  type MyWorkKind,
} from "../pware.oc.runtime/pware.oc.runtime.mywork.js"
import {
  emptyDb,
  emptyProjectFeed,
  isRealSession,
  listOpenQuestions,
  mergeTools,
  readProjectFeed,
  type ProjectFeed,
} from "../pware.oc.opencode/resolver/index.js"
import { type DocView } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.doc.js"
import type { DelegateView } from "../pware.oc.runtime/resolver/pware.oc.runtime.resolver.delegate.js"
import { enrichApprovalSessionStates, planSessionStateLabel } from "../pware.oc.runtime/pware.oc.runtime.mywork-enrich.js"
import {
  ROW_MIN,
  ROW_RANK,
  SESSION_MORE_STEP,
  packSections,
  panelRows,
  rowsForPlan,
} from "../pware.oc.core/pware.oc.core.layout.js"
import { openReadonlyDb } from "../pware.oc.core/pware.oc.core.sqlite.js"
import {
  MARK_QUEUED,
  PULSE_LIVE,
  PULSE_STALE,
} from "../pware.oc.core/constants/pware.oc.core.constants.pulse.js"
import {
  STATUS_ARCHIVED,
  TOOL_STATUS_RUNNING,
} from "../pware.oc.core/constants/pware.oc.core.constants.status.js"
import {
  SESSION_STATUS_ARCHIVED,
} from "../pware.oc.opencode/constants/pware.oc.opencode.constants.sessionStatus.js"
import {
  ROW_KIND_AGENT,
  ROW_KIND_DELEGATE,
  ROW_KIND_FILE,
  ROW_KIND_GROUP,
  ROW_KIND_TOOL,
} from "../pware.oc.core/constants/pware.oc.core.constants.rowKind.js"
import {
  QUESTION_KIND_ERROR,
  QUESTION_KIND_INTERRUPTED,
  QUESTION_KIND_QUESTION,
} from "../pware.oc.opencode/constants/pware.oc.opencode.constants.questionKind.js"
import {
  MY_WORK_GROUP_DISMISSED,
  MY_WORK_GROUP_DRAFTING,
  MY_WORK_GROUP_FINISHED,
  MY_WORK_GROUP_READY_REVIEW,
  MY_WORK_GROUP_READY_START,
  MY_WORK_GROUP_RUNNING,
} from "../pware.oc.core/constants/pware.oc.core.constants.myWork.js"
import { DOC_KIND_DRAFT } from "../pware.oc.omo/constants/pware.oc.omo.constants.docKind.js"
import {
  GROUP_GLYPH,
  engageDone,
  engageFill,
  fileLetterGlyph,
  markTone,
  myWorkGlyph,
  reviewStateSuffix,
  spinnerFrame,
} from "./pware.oc.ui.glyphs.js"
import { dismissQuestion, kvReadOne, kvWriteOne, readDismissedQuestions, ClickText, type ThemeColors } from "./pware.oc.ui.chrome.js"
import {
  AgentLine,
  FoldSection,
  GroupSection,
  RowList,
  TabColumn,
  OesStatusRow,
  agentDisplayName,
  clip,
  useFold,
  useReveal,
  type RevealState,
  type RowData,
} from "./pware.oc.ui.sections.js"
import { emptyPerf, readPerfSnapshot } from "../pware.oc.perf/pware.oc.perf.reader.js"
import { PerfPanel } from "../pware.oc.perf/pware.oc.perf.view.js"
import { rateSparkline, shareBar } from "../pware.oc.perf/pware.oc.perf.charts.js"
import { StatRealtimeTimeline } from "../pware.oc.perf/pware.oc.perf.realtimeTimeline.js"
import { EventDriverSampler } from "../pware.oc.perf/pware.oc.perf.realtimeSampler.js"
import { readCpuRam } from "../pware.oc.perf/pware.oc.perf.realtimeCpuRam.js"
import { STAT_REALTIME_BLOCK, seriesValues, type StatRealtimeSeriesKey, type StatRealtimeTabId } from "../pware.oc.perf/pware.oc.perf.realtimeBlock.js"
import { formatSelfLine, readRendererFps, readSelfStats, resetSelfStats, selfTime, setSelfFps } from "../pware.oc.perf/pware.oc.perf.self.js"
import {
  decorateFiles,
  fileFilter,
  filesFromEvent,
  mergeFiles,
  sumDiff,
  type FileView,
} from "../pware.oc.opencode/pware.oc.opencode.files.js"
import { onGitMarksChange } from "../pware.oc.core/git/pware.oc.core.git.js"
import { getOes } from "../pware.oc.core/pware.oc.core.oes.js"
import {
  TAB_STATUS_SESSION_NOT_IN_DB,
  sessionStatusLabel,
  tabStatus,
} from "../pware.oc.core/pware.oc.core.status.js"
import { createEventBus } from "../pware.oc.core/pware.oc.core.bus.js"
import { startRuntimeSource } from "../pware.oc.runtime/pware.oc.runtime.source.js"
import { openApprovalDialog, openDocDetail, openFileDetail, openFileListDialog, openQuestionDialog, openToolDetail } from "./pware.oc.ui.menudialogs.js"
import { startHostEventBridge } from "./pware.oc.ui.live.js"
import {
  approvePlan,
  openNewSessionPrompt,
  openSessionSwitcher,
  runStartWork,
  selectSession,
} from "./pware.oc.ui.host.js"
import { dbg, debugActive, debugActiveDir, profile, profileActive, profileActiveDir, profileAsync, writeProfileSummary } from "../pware.oc.core/pware.oc.core.debug.js"
import { getOpenCodeDbPath } from "../pware.oc.core/pware.oc.core.paths.js"
import {
  FPS_READ_EVERY_TICKS,
  GLYPH_TICK_MS,
  NOW_MS,
  SWITCH_TIMEOUT_MS,
  TICK_MS,
  TOKEN_RATE_WINDOW_MS,
} from "../pware.oc.core/pware.oc.core.timing.js"
import {
  activeFlow,
  applyFlow,
  composeMark,
  formatAge,
  formatCompact,
  formatDuration,
  formatTokenRate,
  hottestMark,
  phaseAgeMs,
  pulseAgeMs,
  pushTokenTick,
  tokenRate,
  toolFlow,
  toolMark,
  type AgentMark,
  type FlowDir,
  type FlowEntry,
  type TokenTick,
  type ToolHit,
} from "../pware.oc.core/pware.oc.core.pulse.js"
import {
  EV_OES_SESSION_SELECT,
  EV_OES_SNAPSHOT,
} from "../pware.oc.core/constants/pware.oc.core.constants.eventName.js"
import {
  EV_OC_FILES_TOUCHED,
  EV_OC_FLOW,
  EV_OC_SESSION_ACTIVITY,
  EV_OC_TOKENS_DELTA,
  EV_OC_TOOL_HIT,
} from "../pware.oc.opencode/constants/pware.oc.opencode.constants.eventName.js"

export type SidebarProps = {
  sessionId: string
  api: TuiPluginApi
  theme: TuiTheme
}

const KV_FOLD_AGENTS = "oes.fold.agents"
const KV_FOLD_DELEGATES = "oes.fold.delegates"
const KV_FOLD_SESSIONS = "oes.fold.sessions"
const KV_FOLD_TOOLS = "oes.fold.tools"
const KV_FOLD_FILES = "oes.fold.files"
const KV_FOLD_DRAFTS = "oes.fold.drafts"
const KV_TAB = "oes.tab"

const OES_TABS = ["mywork", "current", "sessions", "perf"] as const
type OesTab = (typeof OES_TABS)[number]

const TAB_LABELS: Record<string, string> = {
  mywork: "My work",
  sessions: "Project",
  current: "Session",
  perf: "Stats",
}

/**
 * The cold-start "engage" bar (and its success toast) plays once per plugin
 * boot. The module latch survives sidebar remounts across route changes so a
 * session switch never replays the animation.
 */
let engageSeen = false

function emptyRuntime(): RuntimeSnapshot {
  const dbPath = getOpenCodeDbPath()
  return {
    generatedAt: 0,
    fingerprint: "",
    scanStamp: "0",
    db: emptyDb(dbPath),
    omo: emptyOmo(),
    omoConfig: { present: false, path: null, teamMode: null, agents: [] },
    delegates: [],
  }
}

export function SidebarPanel(props: SidebarProps): JSX.Element {
  const [snap, setSnap] = createSignal<RuntimeSnapshot>(emptyRuntime())
  const [now, setNow] = createSignal(Date.now())
  const [frame, setFrame] = createSignal(0)
  const [glyphFrame, setGlyphFrame] = createSignal(0)
  const [seen, setSeen] = createSignal<Record<string, number>>({})
  const [busy, setBusy] = createSignal<Record<string, boolean>>({})
  const [flow, setFlow] = createSignal<Record<string, FlowEntry>>({})
  const [tab, setTab] = createSignal<OesTab>(kvReadOne(props.api, KV_TAB, "current", OES_TABS))
  const dimensions = useTerminalDimensions()
  const [liveTools, setLiveTools] = createSignal<Record<string, ToolHit>>({})
  const [liveFiles, setLiveFiles] = createSignal<Record<string, FileView>>({})
  const [tokenTicks, setTokenTicks] = createSignal<readonly TokenTick[]>([])
  const [rtVersion, setRtVersion] = createSignal(0)
  const [rtTab, setRtTab] = createSignal<StatRealtimeTabId>("tokens")
  const [rtRow, setRtRow] = createSignal<StatRealtimeSeriesKey>("sum")
  const [gitTick, setGitTick] = createSignal(0)
  const [switching, setSwitching] = createSignal<{ id: string; at: number } | null>(null)
  const [coldTab, setColdTab] = createSignal<string | null>(null)

  const engageBootFrame = glyphFrame()
  const [engaging, setEngaging] = createSignal(!engageSeen)
  const engageTick = (): number => Math.max(0, glyphFrame() - engageBootFrame)

  const colors = (): ThemeColors => props.theme.current as unknown as ThemeColors

  const requestRender = () => {
    try {
      profile("requestRender", () => props.api.renderer.requestRender())
    } catch {
      // teardown
    }
  }

  const bumpSeen = (id: string | null | undefined) => {
    if (!id) return
    setSeen((prev) => ({ ...prev, [id]: Date.now() }))
  }

  const apply = (next: RuntimeSnapshot) => {
    setSnap(next)
    requestRender()
  }

  /** Session switch with the tab status row shown until the target snapshot lands. */
  const goSession = (id: string | null | undefined) => {
    if (!id) return
    selectSession(props.api, id)
    if (id === props.sessionId) return
    setSwitching({ id, at: Date.now() })
  }

  const projectDir = () => props.api.state.path.directory ?? null
  const projectRoots = () => {
    const dir = projectDir()
    const tree = props.api.state.path.worktree ?? null
    return [dir, tree].filter((p): p is string => Boolean(p))
  }

  const bus = createEventBus()
  let watchedId = props.sessionId
  let source = startRuntimeSource({
    bus,
    sessionId: watchedId,
    projectRoot: projectDir(),
  })

  const refresh = () => profile("scan", () => selfTime("scan", () => source.refresh()))

  const ingestFiles = (hits: FileView[]) => {
    if (!hits.length) return
    setLiveFiles((prev) => {
      const next = { ...prev }
      for (const f of hits) next[f.id] = f
      return next
    })
  }

  const hydrateDiff = () =>
    profile("hydrate", () => {
      try {
        const fn = props.api.client?.session?.diff
        if (typeof fn !== "function") return
        const take = (res: unknown) => {
          const o = res && typeof res === "object" ? (res as Record<string, unknown>) : null
          const rows = o && (Array.isArray(o.data) ? o.data : Array.isArray(o.diff) ? o.diff : null)
          const list = rows ?? (Array.isArray(res) ? res : null)
          if (!list) return
          ingestFiles(
            filesFromEvent(
              { type: "session.diff", properties: { sessionID: props.sessionId, diff: list } },
              props.sessionId,
              fileFilter(projectDir()),
            ),
          )
        }
        void profileAsync("rpc.diff", () =>
          Promise.resolve()
            .then(() => fn({ sessionID: props.sessionId }))
            .then(take)
            .catch(() => {}),
        )
      } catch {
        // host client without session.diff
      }
    })

  /** Rebind to the session the props point at. A stale select event only nudges a refresh. */
  const remount = () =>
    profile("remount", () => {
      const id = props.sessionId
      if (id === watchedId) {
        refresh()
        return
      }
      resetSelfStats()
      watchedId = id
      setLiveTools({})
      setLiveFiles({})
      setTokenTicks([])
      source.setSession(id)
      queueMicrotask(hydrateDiff)
    })

  createEffect(on(() => props.sessionId, remount, { defer: true }))

  queueMicrotask(hydrateDiff)
  // The monitor's initial forced emit (startRuntimeSource → startMonitor) runs
  // before the EV_OES_SNAPSHOT listener below is registered, so the bus drops
  // it. Re-emit once now that listeners exist — the snapshot was already
  // computed and cached, so this is a cache hit, not a second full read.
  queueMicrotask(refresh)

  const offSnapshot = bus.on(EV_OES_SNAPSHOT, (evt) => {
    const data = evt.data
    if (!data || typeof data !== "object") return
    const snapshot = (data as Record<string, unknown>).snapshot
    if (!snapshot || typeof snapshot !== "object") return
    apply(snapshot as RuntimeSnapshot)
    const s = switching()
    if (s) {
      const rs = snapshot as RuntimeSnapshot
      const landed = rs.db?.current?.id === s.id
      const failed = Boolean(rs.db?.error) && rs.db?.error !== TAB_STATUS_SESSION_NOT_IN_DB
      if (landed || failed || Date.now() - s.at > SWITCH_TIMEOUT_MS) setSwitching(null)
    }
  })

  const offSessionActivity = bus.on(EV_OC_SESSION_ACTIVITY, (evt) => {
    const data = evt.data
    if (!data || typeof data !== "object") return
    const payload = data as Record<string, unknown>
    const busyFlag = payload.busy
    if (typeof busyFlag !== "boolean") return
    const id = typeof payload.sessionId === "string" && payload.sessionId ? payload.sessionId : props.sessionId
    if (busyFlag) bumpSeen(id)
    setBusy((prev) => ({ ...prev, [id]: busyFlag }))
  })

  const offFlow = bus.on(EV_OC_FLOW, (evt) => {
    const data = evt.data
    if (!data || typeof data !== "object") return
    const payload = data as Record<string, unknown>
    const id = typeof payload.sessionId === "string" ? payload.sessionId : ""
    const dir = payload.dir
    if (!id || (dir !== "recv" && dir !== "wait" && dir !== "tool" && dir !== "clear")) return
    if (dir !== "clear") bumpSeen(id)
    const at = Date.now()
    setFlow((prev) => applyFlow(prev, id, dir, at))
  })

  const offToolHit = bus.on(EV_OC_TOOL_HIT, (evt) => {
    const data = evt.data
    if (!data || typeof data !== "object") return
    const payload = data as Record<string, unknown>
    const hit = payload.hit
    if (!hit || typeof hit !== "object") return
    const h = hit as { id?: unknown }
    if (typeof h.id !== "string" || !h.id) return
    const toolHit = hit as ToolHit
    bumpSeen(toolHit.sessionId ?? props.sessionId)
    setLiveTools((prev) => ({ ...prev, [toolHit.id]: toolHit }))
  })

  const offFilesTouched = bus.on(EV_OC_FILES_TOUCHED, (evt) => {
    const data = evt.data
    if (!data || typeof data !== "object") return
    const payload = data as Record<string, unknown>
    const files = payload.files
    if (!Array.isArray(files)) return
    const sessionId = typeof payload.sessionId === "string" && payload.sessionId ? payload.sessionId : props.sessionId
    bumpSeen(sessionId)
    ingestFiles(files as FileView[])
  })

  const offTokensDelta = bus.on(EV_OC_TOKENS_DELTA, (evt) => {
    const data = evt.data
    if (!data || typeof data !== "object") return
    const payload = data as Record<string, unknown>
    const tokens = payload.tokens
    if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) return
    setTokenTicks((prev) => pushTokenTick(prev, Date.now(), tokens, TOKEN_RATE_WINDOW_MS))
    const sessionId = typeof payload.sessionId === "string" && payload.sessionId ? payload.sessionId : props.sessionId
    const kind = payload.kind === "reasoning" ? "reasoning" : "out"
    rtTimeline.ingestEstimate(sessionId, kind, tokens, Date.now())
  })

  const offSessionSelect = bus.on(EV_OES_SESSION_SELECT, () => remount())

  const bridge = startHostEventBridge({
    api: props.api,
    bus,
    sessionId: () => props.sessionId,
    projectRoot: projectDir,
    onRender: requestRender,
  })

  // One shared realtime timeline (tokens / cache / CPU / RAM). Exact cumulative
  // totals arrive on session.updated; estimated stream deltas arrive on the bus;
  // the UI tick below folds everything into a grid sample every TICK_MS, so the
  // chart's right edge always reaches now instead of waiting for an event.
  const rtTimeline = StatRealtimeTimeline.build(null)
  const rtSampler = EventDriverSampler.create(rtTimeline, (handler) => {
    try {
      const on = props.api.event.on as (
        name: string,
        cb: (evt: unknown, meta?: { directory?: unknown }) => void,
      ) => unknown
      const off = on("session.updated", (evt, meta) => {
        const dir = projectDir()
        if (dir && meta?.directory && String(meta.directory) !== dir) return
        handler(evt)
      })
      return typeof off === "function" ? () => off() : () => {}
    } catch {
      return () => {}
    }
  })
  rtSampler.start()

  let tickCount = 0
  const tick = setInterval(() => {
    profile("tick", () => {
      selfTime("tick", () => {
        // Coarse: ages/marks recompute at most once a second; the spinner phase
        // (`frame`) still animates every tick. Returning `prev` skips the cascade.
        setNow((prev) => {
          const n = Date.now()
          return n - prev >= NOW_MS ? n : prev
        })
        setFrame((n) => n + 1)
        // Realtime grid: CPU/RAM are read here and the timeline folds one sample.
        const at = Date.now()
        rtTimeline.ingestCpuRam(readCpuRam(), at)
        rtTimeline.tick(at)
        setRtVersion((n) => n + 1)
      })
      tickCount += 1
      if (tickCount % FPS_READ_EVERY_TICKS === 0) {
        const r = readRendererFps(props.api.renderer)
        setSelfFps(r.fps, r.frameMs)
      }
    })
  }, TICK_MS)

  /** Fast glyph heartbeat — spinners and direction flows step at `GLYPH_TICK_MS`. */
  const glyphTick = setInterval(() => setGlyphFrame((n) => n + 1), GLYPH_TICK_MS)

  const offGit = onGitMarksChange(() => {
    profile("git", () => {
      setGitTick((n) => n + 1)
      queueMicrotask(requestRender)
    })
  })

  createEffect(() => {
    profile("render", () => {
      frame()
      now()
      flow()
      liveTools()
      liveFiles()
      queueMicrotask(requestRender)
    })
  })

  createEffect(() => {
    profile("render", () => {
      glyphFrame()
      queueMicrotask(requestRender)
    })
  })

  // Cold tabs show their loading row for one short beat, then compute for real.
  createEffect(() => {
    const t = coldTab()
    if (!t) return
    const timer = setTimeout(() => setColdTab(null), 100)
    onCleanup(() => clearTimeout(timer))
  })

  // End the boot bar once the first real snapshot landed after the minimum
  // show time (or the hard ceiling) — then toast exactly once per boot.
  createEffect(() => {
    if (!engaging()) return
    if (engageDone(engageTick(), Boolean(snap().fingerprint))) {
      setEngaging(false)
      engageSeen = true
      try {
        props.api.ui.toast({
          message: "OpenCode Extended Sidebar Loaded. Engage!",
          variant: "success",
          duration: 7000,
        })
      } catch {
        // host without toast
      }
      requestRender()
    }
  })

  onCleanup(() => {
    clearInterval(tick)
    clearInterval(glyphTick)
    rtSampler.stop()
    bridge.stop()
    offSnapshot()
    offSessionActivity()
    offFlow()
    offToolHit()
    offFilesTouched()
    offTokensDelta()
    offSessionSelect()
    source.stop()
    offGit()
    writeProfileSummary()
  })

  const rowMark = (
    lifecycle: string | null | undefined,
    archived: boolean,
    isBusy: boolean,
    ...stamps: Array<number | null | undefined>
  ): AgentMark =>
    composeMark({
      lifecycle,
      archived,
      busy: isBusy,
      ageMs: pulseAgeMs(now(), ...stamps),
    })

  const mainMark = createMemo(() => {
    const m = snap().db.main
    if (!m) return MARK_QUEUED
    return rowMark(
      m.status === SESSION_STATUS_ARCHIVED ? STATUS_ARCHIVED : null,
      m.status === SESSION_STATUS_ARCHIVED,
      Boolean(busy()[m.id]),
      m.timeUpdated,
      seen()[m.id],
    )
  })

  const rowFlow = (id: string | null | undefined, isBusy: boolean): FlowDir | null =>
    activeFlow(id ? flow()[id] : undefined, now(), isBusy)

  const mainFlow = createMemo(() => {
    const m = snap().db.main
    return rowFlow(m?.id, Boolean(m && busy()[m.id]))
  })

  const currentRow = createMemo(() => snap().db.current)

  const currentMark = createMemo(() => {
    const c = currentRow()
    if (!c) return MARK_QUEUED
    return rowMark(
      c.status === SESSION_STATUS_ARCHIVED ? STATUS_ARCHIVED : null,
      c.status === SESSION_STATUS_ARCHIVED,
      Boolean(busy()[c.id]),
      c.timeUpdated,
      seen()[c.id],
    )
  })

  const currentFlow = createMemo(() => {
    const c = currentRow()
    return rowFlow(c?.id, Boolean(c && busy()[c.id]))
  })

  const sessionDelegates = createMemo(() => delegatesForSession(snap(), props.sessionId))

  const delegateMark = (d: DelegateView): AgentMark =>
    rowMark(
      d.status,
      d.archived,
      Boolean(d.sessionId && busy()[d.sessionId]),
      d.timeUpdated,
      d.sessionId ? seen()[d.sessionId] : null,
    )

  const err = createMemo(() => {
    const e = snap().db.error
    if (!e || e === "session not in db yet") return null
    return e
  })

  const delegatesLive = createMemo(() => {
    let n = 0
    for (const d of snap().delegates) {
      const m = delegateMark(d)
      if (m === PULSE_LIVE || m === PULSE_STALE) n += 1
    }
    return n
  })

  const foldAgents = useFold(props.api, KV_FOLD_AGENTS, { after: requestRender })
  const foldDelegates = useFold(props.api, KV_FOLD_DELEGATES, { after: requestRender })
  const foldSessions = useFold(props.api, KV_FOLD_SESSIONS, { after: requestRender })
  const foldTools = useFold(props.api, KV_FOLD_TOOLS, { after: requestRender })
  const foldFiles = useFold(props.api, KV_FOLD_FILES, { after: requestRender })
  const foldDrafts = useFold(props.api, KV_FOLD_DRAFTS, { after: requestRender })

  const myWorkFold = {} as Record<MyWorkKind, ReturnType<typeof useFold>>
  for (const kind of MY_WORK_ORDER) {
    // The Errors group is noise until you want it — start collapsed.
    myWorkFold[kind] = useFold(props.api, `oes.fold.mywork.${kind}`, {
      after: requestRender,
      defaultOpen: kind !== QUESTION_KIND_ERROR && kind !== MY_WORK_GROUP_DISMISSED,
    })
  }

  // Reveal state is hoisted, not owned by GroupSection: the My work memos
  // read the `now()` clock, so <For> reconciles them to fresh objects
  // every second — a reveal signal created inside the component would be
  // thrown away with it and the "… +N more" click would collapse on its own.
  const myWorkReveal = {} as Record<MyWorkKind, RevealState>
  for (const kind of MY_WORK_ORDER) {
    myWorkReveal[kind] = useReveal(2)
  }

  const oes = () => getOes(projectDir())
  const tools = createMemo(() => mergeTools(snap().db.tools, liveTools(), now(), oes().toolFetch))

  /**
   * Project-wide feed — tools/files from every main session. The DB queries run
   * only while the Sessions tab is open; elsewhere the memo stays empty.
   */
  const projectFeed = createMemo<ProjectFeed>(() => {
    if (tab() !== "sessions" || coldTab() === "sessions") return emptyProjectFeed()
    const db = snap().db
    return readProjectFeed({
      dbPath: db.dbPath,
      sessionIds: db.recent.map((s) => s.id),
      toolLimit: oes().toolFetch,
      filter: fileFilter(projectDir()),
    })
  })
  const projectFilesStat = createMemo(() => sumDiff(projectFeed().files))

  const filesAll = createMemo(() => {
    gitTick()
    return decorateFiles(mergeFiles(snap().db.files ?? [], liveFiles()), projectDir(), {
      git: tab() === "current" && foldFiles.open(),
    })
  })
  const filesStat = createMemo(() => sumDiff(filesAll()))

  const pickTab = (next: string) => {
    if (!(OES_TABS as readonly string[]).includes(next)) return
    const picked = next as OesTab
    if (picked !== tab()) {
      setTab(picked)
      kvWriteOne(props.api, KV_TAB, picked)
      // Cold start: the tab's heavy reads run after the status row shows, so
      // the loading line is actually visible instead of a one-frame flash.
      if (picked === "mywork" || picked === "sessions" || picked === "perf") {
        setColdTab(picked)
      }
    }
    if (picked === "current" || picked === "perf") refresh()
    requestRender()
  }

  const omoPresent = createMemo(() => snap().omo.present)

  /** Drafts under `.omo/drafts/` — last five inline, the full list behind "view all". */
  const draftsAll = createMemo<DocView[]>(() => {
    if (tab() !== "current" || !omoPresent()) return []
    now() // re-scan while open; the docs cache TTL gates the filesystem read
    try {
      return DraftFile.list(projectDir())
    } catch (e) {
      dbg("drafts", "error", String(e))
      return []
    }
  })
  const drafts = createMemo(() => draftsAll().slice(0, 5))

  /** Open `question` tools anywhere in this project — the "answer me" queue. */
  const myWorkQuestions = createMemo<MyWorkItem[]>(() => {
    if (tab() !== "mywork" || coldTab() === "mywork") return []
    const db = snap().db
    try {
      return dropDismissed(
        toQuestionItems(listOpenQuestions({ dbPath: db.dbPath, projectId: db.projectId })),
        readDismissedQuestions(props.api),
      )
    } catch (e) {
      dbg("mywork.questions", "error", String(e))
      return []
    }
  })

  /** OMO drafts/plans across all four states, enriched with planner-session state. */
  const myWorkApprovals = createMemo<MyWorkItem[]>(() => {
    if (tab() !== "mywork" || coldTab() === "mywork" || !omoPresent()) return []
    now() // re-scan while open; the plans cache TTL gates the filesystem read
    const dir = projectDir()
    try {
      const buckets = listApprovals(dir)
      return toApprovalItems(
        enrichApprovalSessionStates(
          [
            ...buckets.readyReview,
            ...buckets.readyStart,
            ...buckets.finished,
            ...buckets.drafting,
          ],
          {
            dbPath: snap().db.dbPath,
            projectRoot: dir,
          },
        ),
      )
    } catch (e) {
      dbg("mywork.approvals", "error", String(e))
      return []
    }
  })

  /** Recent main sessions still running or idle — the "Running" group. */
  const myWorkRunning = createMemo<MyWorkItem[]>(() => {
    if (tab() !== "mywork" || coldTab() === "mywork") return []
    return toRunningItems(snap().db.recent)
  })

  const myWorkItems = createMemo<MyWorkItem[]>(() => [
    ...myWorkQuestions(),
    ...myWorkRunning(),
    ...myWorkApprovals(),
  ])

  const myWorkGroups = createMemo(() => groupMyWork(myWorkItems()))

  /**
   * Rows are handed out on every render: chrome that always costs a line is
   * counted first, then `packSections` splits what is left.
   */
  const rowPlan = createMemo(() => {
    try {
      const o = oes()
      const t = tab()
      const omo = omoPresent()
      const sections: { key: string; want: number; min: number; rank: number }[] = []
      let fixed = 8 // OES status bar + realtime block (tabs + 3 selector rows) + self line + brand line + top padding
      if (modeLine()) fixed += 1 // debug/profile flag row
      if (modeDirLine()) fixed += 1
      if (engaging()) fixed += 1 // cold-start engage bar row
      let blocks = 0

      const header = () => {
        blocks += 1
        fixed += 1
      }
      const section = (folded: boolean, key: string, want: number, min: number, rank: number) => {
        header()
        if (!folded) sections.push({ key, want, min, rank })
      }

      if (t === "sessions") {
        header()
        fixed += foldAgents.open() ? 1 : 0
        section(!foldSessions.open(), "sessions", o.sessionRows, ROW_MIN.sessions, ROW_RANK.sessions)
        const feed = projectFeed()
        if (feed.tools.length > 0) section(!foldTools.open(), "tools", o.toolRows, ROW_MIN.tools, ROW_RANK.tools)
        if (feed.files.length > 0) section(!foldFiles.open(), "files", o.fileRows, ROW_MIN.files, ROW_RANK.files)
        if (omo) section(!foldDelegates.open(), "delegates", 6, ROW_MIN.delegates, ROW_RANK.delegates)
      } else if (t === "current") {
        header()
        fixed += foldAgents.open() ? 1 : 0
        section(!foldDelegates.open(), "delegates", 6, ROW_MIN.delegates, ROW_RANK.delegates)
        section(!foldTools.open(), "tools", o.toolRows, ROW_MIN.tools, ROW_RANK.tools)
        section(!foldFiles.open(), "files", o.fileRows, ROW_MIN.files, ROW_RANK.files)
        if (omo && draftsAll().length > 0) {
          section(!foldDrafts.open(), "drafts", Math.min(5, draftsAll().length), ROW_MIN.drafts, ROW_RANK.drafts)
        }
      } else if (t === "mywork") {
        header()
        for (const g of myWorkGroups()) {
          const fold = myWorkFold[g.kind]
          if (!fold) continue
          section(!fold.open(), `mywork.${g.kind}`, g.items.length, ROW_MIN.mywork, ROW_RANK.mywork)
        }
      } else {
        // Perf lays out its own sections and already caps itself with perfRows.
        fixed += 18
      }
      fixed += Math.max(0, blocks - 1) // one blank row between OES sections

      const height = dimensions()?.height
      return packSections(panelRows(typeof height === "number" ? height : 24), fixed, sections)
    } catch (e) {
      dbg("rowplan", "error", String(e))
      return {}
    }
  }, {})

  const rowsFor = (key: string, fallback: number): number => {
    try {
      return rowsForPlan(rowPlan(), key, fallback)
    } catch {
      return fallback
    }
  }

  const sessionsReveal = useReveal(SESSION_MORE_STEP)
  const projectToolsReveal = useReveal(Math.max(1, oes().toolRows))
  const toolsReveal = useReveal(Math.max(1, oes().toolRows))
  const delegateReveal = useReveal(4)
  const currentDelegatesReveal = useReveal(4)

  const myWorkRow = (item: MyWorkItem): RowData => {
    if (item.kind === MY_WORK_GROUP_RUNNING) {
      const isBusy = Boolean(item.sessionId && busy()[item.sessionId])
      return {
        kind: ROW_KIND_AGENT,
        mark: rowMark(
          item.status,
          false,
          isBusy,
          item.timeUpdated,
          item.sessionId ? seen()[item.sessionId] : null,
        ),
        dirSlot: true,
        flow: rowFlow(item.sessionId, isBusy),
        name: item.title,
        suffix: sessionStatusLabel(item.status),
        onSelect: () => goSession(item.sessionId),
      }
    }
    if ("sessionId" in item) {
      const age = pulseAgeMs(now(), item.startedAt)
      const dismissible = item.kind === QUESTION_KIND_INTERRUPTED || item.kind === QUESTION_KIND_ERROR
      return {
        kind: ROW_KIND_AGENT,
        glyph: myWorkGlyph(item.kind),
        name: item.title,
        suffix: formatAge(age),
        subline: item.reason ?? undefined,
        onSelect: dismissible
          ? () =>
              openQuestionDialog(props.api, {
                title: item.title,
                sessionId: item.sessionId,
                onNavigate: (sid) => goSession(sid),
                onDismiss: () => {
                  dismissQuestion(props.api, item.partId)
                  requestRender()
                },
              })
          : () => goSession(item.sessionId),
      }
    }
    const sessionLabel = planSessionStateLabel(item.sessionState)
    const reviewLabel = reviewStateSuffix(item.review)
    const drafting = item.kind === MY_WORK_GROUP_DRAFTING
    const showApprove = item.kind === MY_WORK_GROUP_READY_REVIEW
    const showStartWork =
      item.kind === MY_WORK_GROUP_READY_REVIEW || item.kind === MY_WORK_GROUP_READY_START
    const doc: DocView = {
      kind: DOC_KIND_DRAFT,
      name: item.name,
      rel: item.rel,
      updatedAt: item.updatedAt,
      sizeBytes: 0,
      previewable: true,
    }
    return {
      kind: ROW_KIND_FILE,
      glyph: myWorkGlyph(item.kind),
      name: item.name,
      suffix: [sessionLabel, reviewLabel].filter(Boolean).join(" ") || undefined,
      onSelect: () => {
        const db = openReadonlyDb(snap().db.dbPath)
        const sessionId = db ? sessionForPlanFile(db, item.rel) : null
        const base: Parameters<typeof openApprovalDialog>[1] = {
          title: item.name,
          sessionId,
          continueHint: approvalContinueHint(sessionId, Boolean(db)),
          onContinue: (sid) => selectSession(props.api, sid),
          onApprove: (sid) => approvePlan(props.api, sid),
          onStartWork: (mode) => runStartWork(props.api, props.sessionId, mode, item.name),
          onDocs: () => openDocDetail(props.api, doc, projectRoots(), colors()),
        }
        if (drafting) {
          openApprovalDialog(props.api, {
            ...base,
            showApprove: false,
            showStartWork: false,
            docsLabel: "Preview plan file",
          })
          return
        }
        openApprovalDialog(props.api, { ...base, showApprove, showStartWork })
      },
    }
  }

  /** Perf SQLite scan runs only while this tab is open. */
  const perf = createMemo(() => {
    if (tab() !== "perf" || coldTab() === "perf") return emptyPerf(props.sessionId)
    const o = oes()
    const history = o.perfHistory > 0
      ? snap()
          .db.recent.filter((s) => s.id !== props.sessionId)
          .slice(0, o.perfHistory)
          .map((s) => ({ id: s.id, title: s.title }))
      : []
    return readPerfSnapshot({
      dbPath: snap().db.dbPath,
      sessionId: props.sessionId,
      turns: o.perfTurns,
      history,
      cacheKey: `${props.sessionId}::${snap().scanStamp}::${o.perfTurns}`,
    })
  })

  const tabStatusFor = (tab: OesTab) =>
    tabStatus({
      tab,
      currentId: snap().db.current?.id ?? null,
      dbError: snap().db.error,
      dbPresent: snap().db.present,
      switching: switching()?.id ?? null,
      cold: coldTab() === tab,
      perfError: tab === "perf" ? perf().error : null,
      perfTurns: tab === "perf" ? perf().totals.turns : 0,
    })

  const selfFlow = createMemo(() =>
    rowFlow(props.sessionId, Boolean(busy()[props.sessionId])),
  )
  const selfPhaseMs = createMemo(() =>
    phaseAgeMs(flow()[props.sessionId], now(), selfFlow()),
  )

  /** The one place that binds a row to theme, frame and oes.json `lineMax`. */
  const Row = (row: RowData): JSX.Element => (
    <AgentLine
      {...row}
      lineMax={oes().lineMax}
      frame={frame}
      glyphFrame={glyphFrame}
      colors={colors()}
    />
  )

  /** Flatten delegates to rows (agent headers + members) for `RowList`. */
  const delegateLines = (list: DelegateView[]): RowData[] => {
    const out: RowData[] = []
    for (const item of groupDelegates(list)) {
      if (item.kind === "header") {
        out.push({
          kind: ROW_KIND_GROUP,
          glyph: {
            char: GROUP_GLYPH,
            tone: markTone(hottestMark(item.members.map(delegateMark))),
          },
          name: `${agentDisplayName(item.agent)} (${item.count})`,
        })
        continue
      }
      const d = item.delegate
      const isBusy = Boolean(d.sessionId && busy()[d.sessionId])
      const mark = delegateMark(d)
      const dir = rowFlow(d.sessionId, isBusy)
      out.push({
        kind: item.grouped ? ROW_KIND_DELEGATE : ROW_KIND_AGENT,
        mark,
        name: item.grouped ? d.title || d.taskKey || "task" : d.agent || "agent",
        tokens: d.tokensTotal,
        title: item.grouped ? undefined : d.title,
        current: Boolean(d.sessionId && d.sessionId === props.sessionId),
        flow: dir,
        dirSlot: true,
        indent: item.grouped,
        onSelect: () => goSession(d.sessionId),
      })
    }
    return out
  }

  /** A delegate list with its own "… +N more" revealer (state hoisted by the caller). */
  const DelegateList = (props: {
    list: DelegateView[]
    budget: number
    reveal: RevealState
  }): JSX.Element => (
    <RowList
      items={delegateLines(props.list)}
      budget={props.budget + props.reveal.more()}
      colors={colors()}
      renderItem={(r) => <Row {...r} />}
      more={{ onReveal: props.reveal.reveal }}
    />
  )

  /** Live token rate — recomputes on each token delta and once a second (decay). */
  const liveTokenRate = createMemo(() => {
    now()
    return tokenRate(tokenTicks(), Date.now(), TOKEN_RATE_WINDOW_MS)
  })

  const rtActiveTab = createMemo(
    () => STAT_REALTIME_BLOCK.tabs.find((t) => t.id === rtTab()) ?? STAT_REALTIME_BLOCK.tabs[0]!,
  )
  const rtActiveRow = createMemo(
    () => rtActiveTab().rows.find((r) => r.key === rtRow()) ?? rtActiveTab().rows[0]!,
  )
  const rtHistory = createMemo(() => {
    rtVersion()
    return rtTimeline.getTimeline()
  })
  const rtSeries = createMemo(() => seriesValues(rtHistory(), rtActiveRow().read))
  const rtSeriesMax = createMemo(() => {
    let max = 0
    for (const v of rtSeries()) {
      if (Number.isFinite(v) && v > max) max = v
    }
    return max
  })
  const rtLines = createMemo(() =>
    rateSparkline(rtSeries(), {
      width: Math.max(8, oes().lineMax - 12),
      height: 3,
      charset: "braille",
    }),
  )
  /** Axis column beside the chart: dynamic max on top, the chart's 0 baseline on the bottom. */
  const rtAxisLines = createMemo(() => {
    const n = rtLines().length
    if (n === 0) return []
    const pad = (s: string): string => s.padStart(3)
    // CPU is a 0–100 % reading; the axis reads it as a 0.0–1.0 fraction.
    const top = rtActiveRow().key === "cpu" ? rtSeriesMax() / 100 : rtSeriesMax()
    const out = [pad(formatCompact(top))]
    for (let i = 1; i < n - 1; i += 1) out.push("   ")
    out.push(pad("0"))
    return out
  })

  /** Live self-cost line — reads the tick clock so the Solid insert re-evaluates every tick. */
  const selfLine = createMemo(() => {
    now()
    return formatSelfLine(readSelfStats())
  })

  /** "debug mode" / "profile" flags — visible only while the logger is actually active. */
  const modeLine = () => {
    const modes: string[] = []
    if (debugActive()) modes.push("debug mode")
    if (profileActive()) modes.push("profile")
    return modes.join("  ")
  }

  const modeDirLine = () => {
    const dirs = [debugActiveDir(), profileActiveDir()].filter((p): p is string => Boolean(p))
    if (dirs.length === 0) return ""
    const uniq = Array.from(new Set(dirs))
    return `logs ${clip(uniq.join(" | "), 78)}`
  }

  return (
    <box flexDirection="column" gap={1} paddingTop={1}>
      <Show when={engaging()}>
        <box flexDirection="row" gap={1}>
          <text fg={colors().primary}>{`${spinnerFrame(engageTick())} engage`}</text>
          <text fg={colors().textMuted}>{shareBar(engageFill(engageTick()), 10)}</text>
        </box>
      </Show>
      <Show when={modeLine()}>
        <text fg={colors().warning || colors().text}>{modeLine()}</text>
      </Show>
      <Show when={modeDirLine()}>
        <text fg={colors().textMuted}>{modeDirLine()}</text>
      </Show>
      <OesStatusRow
        status={tabStatusFor(tab())}
        rate={formatTokenRate(liveTokenRate())}
        colors={colors()}
        glyphFrame={glyphFrame}
      />
      <box flexDirection="row" gap={1}>
        <For each={STAT_REALTIME_BLOCK.tabs}>
          {(t) => (
            <ClickText
              fg={rtTab() === t.id ? colors().primary || colors().text : colors().textMuted}
              bold={rtTab() === t.id}
              underline
              onMouseUp={() => {
                setRtTab(t.id)
                setRtRow(t.rows[0]!.key)
              }}
            >
              {t.label}
            </ClickText>
          )}
        </For>
      </box>
      <box flexDirection="row" gap={1}>
        <box flexDirection="column" gap={0}>
          <For each={rtActiveTab().rows}>
            {(r) => (
              <ClickText
                fg={rtRow() === r.key ? colors().primary || colors().text : colors().textMuted}
                bold={rtRow() === r.key}
                underline
                onMouseUp={() => setRtRow(r.key)}
              >
                {r.label}
              </ClickText>
            )}
          </For>
        </box>
        <box flexDirection="column">
          <For each={rtLines()}>
            {(line) => <text fg={colors().success}>{line || " "}</text>}
          </For>
        </box>
        <box flexDirection="column" gap={0}>
          <For each={rtAxisLines()}>
            {(line) => <text fg={colors().textMuted}>{line}</text>}
          </For>
        </box>
        <box flexDirection="column" gap={0}>
          <For each={rtActiveTab().rows}>
            {() => <text fg={colors().textMuted}>F</text>}
          </For>
        </box>
      </box>
      <text fg={colors().textMuted}>{selfLine()}</text>
      <TabColumn
        brand=""
        tabs={OES_TABS}
        labels={TAB_LABELS}
        active={tab()}
        colors={colors()}
        onPick={pickTab}
        panels={{
          mywork: () => {
            try {
              const groups = myWorkGroups()
              dbg("mywork.panel", "render", { groups: groups.map((g) => `${g.kind}:${g.items.length}`) })
              const status = tabStatusFor("mywork")
              if (!status && groups.length === 0) return <text fg={colors().textMuted}>• nothing</text>
              return (
                <box flexDirection="column" gap={1}>
                  <For each={groups}>
                    {(g) => (
                      <GroupSection
                        title={myWorkLabel(g.kind)}
                        open={myWorkFold[g.kind].open()}
                        onToggle={myWorkFold[g.kind].toggle}
                        colors={colors()}
                        items={g.items}
                        budget={rowsFor(`mywork.${g.kind}`, 2)}
                        reveal={myWorkReveal[g.kind]}
                        renderItem={(item) => <Row {...myWorkRow(item)} />}
                      />
                    )}
                  </For>
                </box>
              )
            } catch (e) {
              dbg("mywork.panel", "error", String(e))
              return <text fg={colors().error || colors().text}>• my work error</text>
            }
          },
          sessions: () => (
            <box flexDirection="column" gap={1}>
              <FoldSection title="Agents" open={foldAgents.open()} colors={colors()} onToggle={foldAgents.toggle}>
                {isRealSession(snap().db.main) ? (
                  <Row
                    kind={ROW_KIND_AGENT}
                    mark={mainMark()}
                    name={snap().db.main!.agent}
                    tokens={snap().db.main!.tokensTotal}
                    cost={snap().db.main!.cost}
                    current={snap().db.main!.id === props.sessionId}
                    flow={mainFlow()}
                    dirSlot
                    onSelect={() => goSession(snap().db.main?.id)}
                  />
                ) : (
                  <text fg={colors().textMuted}>
                    {`• session · ${props.sessionId.slice(0, 14)}`}
                    {err() ? ` · ${err()}` : ""}
                  </text>
                )}
              </FoldSection>

        <Show when={snap().db.recent.length > 0}>
          <FoldSection
            title="Sessions"
            open={foldSessions.open()}
            actions={[
              { label: "switch", onPick: () => openSessionSwitcher(props.api) },
              { label: "new", onPick: () => openNewSessionPrompt(props.api) },
            ]}
            colors={colors()}
            onToggle={foldSessions.toggle}
          >
            <RowList
              items={snap().db.recent}
              budget={rowsFor("sessions", oes().sessionRows) + sessionsReveal.more()}
              colors={colors()}
              renderItem={(s) => {
                const isBusy = Boolean(busy()[s.id])
                const mark = rowMark(
                  s.status === SESSION_STATUS_ARCHIVED ? STATUS_ARCHIVED : null,
                  s.status === SESSION_STATUS_ARCHIVED,
                  isBusy,
                  s.timeUpdated,
                  seen()[s.id],
                )
                const dir = rowFlow(s.id, isBusy)
                return (
                  <Row
                    kind={ROW_KIND_AGENT}
                    mark={mark}
                    name={s.title}
                    current={s.id === props.sessionId}
                    suffix={s.id === props.sessionId ? "[C]" : undefined}
                    flow={dir}
                    dirSlot
                    onSelect={() => goSession(s.id)}
                  />
                )
              }}
              more={{ onReveal: sessionsReveal.reveal }}
            />
          </FoldSection>
        </Show>

        <Show when={projectFeed().tools.length > 0}>
          <FoldSection title="Tool Calls" open={foldTools.open()} colors={colors()} onToggle={foldTools.toggle}>
            <RowList
              items={projectFeed().tools}
              budget={rowsFor("tools", oes().toolRows) + projectToolsReveal.more()}
              colors={colors()}
              renderItem={(t) => {
                const mark = toolMark(t.status)
                const dir = toolFlow(t.status)
                const dur =
                  t.status === TOOL_STATUS_RUNNING && t.startedAt != null
                    ? formatDuration(Math.max(0, now() - t.startedAt))
                    : formatDuration(t.durationMs)
                return (
                  <Row
                    kind={ROW_KIND_TOOL}
                    mark={mark}
                    name={t.name}
                    suffix={dur}
                    flow={dir}
                    dirSlot
                    onSelect={() => openToolDetail(props.api, t, colors())}
                  />
                )
              }}
              more={{ onReveal: projectToolsReveal.reveal }}
            />
          </FoldSection>
        </Show>

        <Show when={projectFeed().files.length > 0}>
          <FoldSection
            title="Files"
            open={foldFiles.open()}
            count={projectFeed().files.length}
            diff={projectFilesStat()}
            actions={[
              {
                label: "view all",
                onPick: () =>
                  openFileListDialog(
                    props.api,
                    "Files",
                    projectFeed().files.map((f) => ({
                      name: f.name,
                      onSelect: () => openFileDetail(props.api, f, projectRoots(), colors()),
                    })),
                  ),
              },
            ]}
            colors={colors()}
            onToggle={foldFiles.toggle}
          >
            <RowList
              items={projectFeed().files}
              budget={rowsFor("files", oes().fileRows)}
              colors={colors()}
              renderItem={(f) => (
                <Row
                  kind={ROW_KIND_FILE}
                  glyph={fileLetterGlyph(f.letter)}
                  name={f.name}
                  diff={{ additions: f.additions, deletions: f.deletions }}
                  onSelect={() => openFileDetail(props.api, f, projectRoots(), colors())}
                />
              )}
            />
          </FoldSection>
        </Show>

        <Show when={snap().omo.present}>
          <FoldSection
            title="Delegates"
            open={foldDelegates.open()}
            count={snap().delegates.length}
            live={delegatesLive()}
            colors={colors()}
            onToggle={foldDelegates.toggle}
          >
            {snap().delegates.length === 0 ? (
              <text fg={colors().textMuted}>• none</text>
            ) : (
              <DelegateList list={snap().delegates} budget={rowsFor("delegates", 6)} reveal={delegateReveal} />
            )}
          </FoldSection>
        </Show>
            </box>
          ),
          current: () => (
            <box flexDirection="column" gap={1}>
              <FoldSection title="Agents" open={foldAgents.open()} colors={colors()} onToggle={foldAgents.toggle}>
                {isRealSession(currentRow()) ? (
                  <Row
                    kind={ROW_KIND_AGENT}
                    mark={currentMark()}
                    name={currentRow()!.agent}
                    tokens={currentRow()!.tokensTotal}
                    cost={currentRow()!.cost}
                    current
                    flow={currentFlow()}
                    dirSlot
                    onSelect={() => goSession(currentRow()?.id)}
                  />
                ) : (
                  <text fg={colors().textMuted}>
                    {`• session · ${props.sessionId.slice(0, 14)}`}
                  </text>
                )}
              </FoldSection>

        <Show when={snap().omo.present || sessionDelegates().length > 0}>
          <FoldSection
            title="Delegates"
            open={foldDelegates.open()}
            count={sessionDelegates().length}
            live={sessionDelegates().filter((d) => {
              const m = delegateMark(d)
              return m === PULSE_LIVE || m === PULSE_STALE
            }).length}
            colors={colors()}
            onToggle={foldDelegates.toggle}
          >
            {sessionDelegates().length === 0 ? (
              <text fg={colors().textMuted}>• none</text>
            ) : (
              <DelegateList list={sessionDelegates()} budget={rowsFor("delegates", 6)} reveal={currentDelegatesReveal} />
            )}
          </FoldSection>
        </Show>

          <FoldSection title="Tool Calls" open={foldTools.open()} colors={colors()} onToggle={foldTools.toggle}>
            {tools().length === 0 ? (
              <text fg={colors().textMuted}>• none</text>
            ) : (
              <RowList
                items={tools()}
                budget={rowsFor("tools", oes().toolRows) + toolsReveal.more()}
                colors={colors()}
                renderItem={(t) => {
                  const mark = toolMark(t.status)
                  const dir = toolFlow(t.status)
                  const dur =
                    t.status === TOOL_STATUS_RUNNING && t.startedAt != null
                      ? formatDuration(Math.max(0, now() - t.startedAt))
                      : formatDuration(t.durationMs)
                  return (
                    <Row
                      kind={ROW_KIND_TOOL}
                      mark={mark}
                      name={t.name}
                      suffix={dur}
                      flow={dir}
                      dirSlot
                      onSelect={() => openToolDetail(props.api, t, colors())}
                    />
                  )
                }}
                more={{ onReveal: toolsReveal.reveal }}
              />
            )}
          </FoldSection>

          <FoldSection
            title="Files"
            open={foldFiles.open()}
            count={filesAll().length > 0 ? filesAll().length : undefined}
            diff={filesStat()}
            actions={[
              {
                label: "view all",
                onPick: () =>
                  openFileListDialog(
                    props.api,
                    "Files",
                    filesAll().map((f) => ({
                      name: f.name,
                      onSelect: () => openFileDetail(props.api, f, projectRoots(), colors()),
                    })),
                  ),
              },
            ]}
            colors={colors()}
            onToggle={foldFiles.toggle}
          >
            {filesAll().length === 0 ? (
              <text fg={colors().textMuted}>• none</text>
            ) : (
              <RowList
                items={filesAll()}
                budget={rowsFor("files", oes().fileRows)}
                colors={colors()}
                renderItem={(f) => (
                  <Row
                    kind={ROW_KIND_FILE}
                    glyph={fileLetterGlyph(f.letter)}
                    name={f.name}
                    diff={{ additions: f.additions, deletions: f.deletions }}
                    onSelect={() => openFileDetail(props.api, f, projectRoots(), colors())}
                  />
                )}
              />
            )}
          </FoldSection>

          <Show when={drafts().length > 0}>
            <FoldSection
              title="Drafts"
              open={foldDrafts.open()}
              count={draftsAll().length}
              actions={[
                {
                  label: "view all",
                  onPick: () =>
                    openFileListDialog(
                      props.api,
                      "Drafts",
                      draftsAll().map((d) => ({
                        name: d.name,
                        description: d.rel,
                        onSelect: () => openDocDetail(props.api, d, projectRoots(), colors()),
                      })),
                    ),
                },
              ]}
              colors={colors()}
              onToggle={foldDrafts.toggle}
            >
              <RowList
                items={drafts()}
                budget={rowsFor("drafts", 5)}
                colors={colors()}
                renderItem={(d) => {
                  const age = pulseAgeMs(now(), d.updatedAt)
                  return (
                    <Row
                      kind={ROW_KIND_FILE}
                      glyph={{ char: "•", tone: markTone(composeMark({ ageMs: age })) }}
                      name={d.name}
                      suffix={formatAge(age)}
                      onSelect={() => openDocDetail(props.api, d, projectRoots(), colors())}
                    />
                  )
                }}
              />
            </FoldSection>
          </Show>
            </box>
          ),
          perf: () => (
            <box flexDirection="column" gap={1}>
              <PerfPanel
                api={props.api}
                perf={perf()}
                colors={colors()}
                lineMax={oes().lineMax}
                rows={oes().perfRows}
                glyphFrame={glyphFrame}
                livePhase={selfFlow()}
                livePhaseMs={selfPhaseMs()}
                currentSessionId={props.sessionId}
                dbPath={snap().db.dbPath}
                turns={oes().perfTurns}
                onSelect={(id) => goSession(id)}
              />
            </box>
          ),
        }}
      />

      {err() && snap().db.main ? (
        <text fg={colors().textMuted}>{err()}</text>
      ) : null}
    </box>
  )
}
