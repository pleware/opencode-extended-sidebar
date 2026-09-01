/** @jsxImportSource @opentui/solid */
import { createEffect, createMemo, createSignal, For, on, Show, onCleanup, type JSX } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import type { TuiKeymap, TuiPluginApi, TuiTheme } from "@opencode-ai/plugin/tui"
import {
  approvalName,
  currentTask,
  emptyOmo,
  groupDocs,
  listApprovals,
  readOmoDocs,
  workRowView,
  workStatusLabel,
} from "../pware.oc.omo/resolver/index.js"
import {
  delegatesForSession,
  groupDelegates,
  type RuntimeSnapshot,
} from "../pware.oc.runtime/resolver/index.js"
import {
  MY_WORK_ORDER,
  approvalContinueHint,
  groupMyWork,
  myWorkLabel,
  startWorkCommand,
  toApprovalItems,
  toQuestionItems,
  type MyWorkItem,
  type MyWorkKind,
  type StartWorkMode,
} from "../pware.oc.runtime/pware.oc.runtime.mywork.js"
import {
  emptyDb,
  emptyProjectFeed,
  listOpenQuestions,
  mergeTools,
  planSessionIndex,
  readProjectFeed,
  sessionForPlanFile,
  type ProjectFeed,
} from "../pware.oc.opencode/resolver/index.js"
import {
  DOC_KIND_LABEL,
  type DocKind,
  type DocView,
} from "../pware.oc.omo/resolver/pware.oc.omo.resolver.doc.js"
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
  FLOW_TOOL,
  MARK_QUEUED,
  MARK_READY,
  PULSE_IDLE,
  PULSE_LIVE,
  PULSE_STALE,
} from "../pware.oc.core/constants/pware.oc.core.constants.pulse.js"
import {
  STATUS_ARCHIVED,
  STATUS_ERROR,
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
} from "../pware.oc.opencode/constants/pware.oc.opencode.constants.questionKind.js"
import {
  MY_WORK_GROUP_DRAFTING,
  MY_WORK_GROUP_FINISHED,
  MY_WORK_GROUP_READY_REVIEW,
  MY_WORK_GROUP_READY_START,
} from "../pware.oc.core/constants/pware.oc.core.constants.myWork.js"
import {
  DOC_KIND_DRAFT,
  DOC_KIND_NOTEPAD,
  DOC_KIND_PLAN,
  DOC_KIND_PROOF,
} from "../pware.oc.omo/constants/pware.oc.omo.constants.docKind.js"
import {
  START_WORK_MAKE_PR,
  START_WORK_SHIP,
} from "../pware.oc.omo/constants/pware.oc.omo.constants.startWork.js"
import {
  GROUP_GLYPH,
  fileLetterMark,
  myWorkGlyph,
  reviewStateSuffix,
  workStatusGlyph,
} from "./pware.oc.ui.glyphs.js"
import { kvReadOne, kvWriteOne, type ThemeColors } from "./pware.oc.ui.chrome.js"
import {
  AgentLine,
  FoldSection,
  GroupSection,
  RowList,
  TabColumn,
  agentDisplayName,
  clip,
  useFold,
  useReveal,
  type RevealState,
  type RowData,
} from "./pware.oc.ui.sections.js"
import { emptyPerf, readPerfSnapshot } from "../pware.oc.perf/pware.oc.perf.reader.js"
import { PerfPanel } from "../pware.oc.perf/pware.oc.perf.view.js"
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
import { isPendingWork } from "../pware.oc.core/pware.oc.core.status.js"
import { startMonitor } from "../pware.oc.runtime/pware.oc.runtime.monitor.js"
import { openApprovalDialog, openDocDetail, openFileDetail, openToolDetail, openWorkDetail } from "./pware.oc.ui.menudialogs.js"
import { eventType, shouldRefreshDb } from "../pware.oc.core/pware.oc.core.events.js"
import { dbg, debugActive, debugActiveDir, profile, profileActive, profileActiveDir, profileAsync, writeProfileSummary } from "../pware.oc.core/pware.oc.core.debug.js"
import { getOpenCodeDbPath } from "../pware.oc.core/pware.oc.core.paths.js"
import {
  EVENT_SCAN_DEBOUNCE_MS,
  FPS_READ_EVERY_TICKS,
  NOW_MS,
  TICK_MS,
} from "../pware.oc.core/pware.oc.core.timing.js"
import {
  activeFlow,
  applyFlow,
  composeMark,
  flowFromEvent,
  formatAge,
  formatDuration,
  hottestMark,
  phaseAgeMs,
  pulseAgeMs,
  sessionBusyFromEvent,
  sessionIdFromEvent,
  toolFlow,
  toolHitFromEvent,
  toolMark,
  type AgentMark,
  type FlowDir,
  type FlowEntry,
  type ToolHit,
} from "../pware.oc.core/pware.oc.core.pulse.js"
import { PART_TYPE_TEXT } from "../pware.oc.core/constants/pware.oc.core.constants.partType.js"

export type SidebarProps = {
  sessionId: string
  api: TuiPluginApi
  theme: TuiTheme
}

function selectSession(api: TuiPluginApi, sessionId: string | null | undefined): void {
  if (!sessionId) return
  const tui = (api as TuiPluginApi & {
    client?: {
      tui?: {
        selectSession?: (arg: unknown) => Promise<unknown> | unknown
        publish?: (arg: unknown) => Promise<unknown> | unknown
      }
    }
  }).client?.tui
  if (!tui) return
  const go = async () => {
    try {
      if (typeof tui.selectSession === "function") {
        await tui.selectSession({ sessionID: sessionId })
        return
      }
    } catch {
      try {
        await tui.selectSession?.(sessionId)
        return
      } catch {
        // publish fallback
      }
    }
    try {
      await tui.publish?.({
        type: "tui.session.select",
        properties: { sessionID: sessionId },
      })
    } catch {
      // host without session switch
    }
  }
  void profileAsync("rpc.selectSession", go)
}

/** Open the host session switcher — the same dialog the `/sessions` command opens. */
function openSessionSwitcher(api: TuiPluginApi): void {
  try {
    const dispatch = (api.keymap as TuiKeymap & { dispatchCommand?: (name: string) => void })
      .dispatchCommand
    if (typeof dispatch === "function") {
      dispatch("session.list")
      return
    }
  } catch {
    // older host — command palette below
  }
  try {
    api.command?.show()
  } catch {
    // host without a command palette
  }
}

/** Create a brand-new session in the current project and jump to it. */
function newSession(api: TuiPluginApi, directory: string | null | undefined): void {
  const go = async () => {
    try {
      const created = await api.client.session.create({
        directory: directory ?? undefined,
      })
      const res = created as { data?: { id?: string }; id?: string } | null | undefined
      const id = res?.data?.id ?? res?.id
      if (id) selectSession(api, id)
    } catch {
      // host without session creation
    }
  }
  void profileAsync("rpc.newSession", go)
}

const KV_FOLD_AGENTS = "oes.fold.agents"
const KV_FOLD_DELEGATES = "oes.fold.delegates"
const KV_FOLD_SESSIONS = "oes.fold.sessions"
const KV_FOLD_TOOLS = "oes.fold.tools"
const KV_FOLD_FILES = "oes.fold.files"
const KV_FOLD_OMO = "oes.fold.omo"
const KV_TAB = "oes.tab"
const KV_OMO_TAB = "oes.omoTab"

/** Docs groups are a fixed enum — the fold keys are stable. */
  const DOC_KIND_ORDER: readonly DocKind[] = [DOC_KIND_PLAN, DOC_KIND_DRAFT, DOC_KIND_NOTEPAD, DOC_KIND_PROOF]

/** Two independent groups: OES is the core, OMO is an optional add-on below it. */
const OES_TABS = ["current", "mywork", "sessions", "perf"] as const
const OMO_TABS = ["works", "boulder", "docs"] as const
type OesTab = (typeof OES_TABS)[number]
type OmoTab = (typeof OMO_TABS)[number]

const TAB_LABELS: Record<string, string> = {
  mywork: "My work",
  sessions: "Summary",
  current: "Session",
  perf: "Stats",
  works: "Works",
  boulder: "Boulder",
  docs: "Docs",
}

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
  const [seen, setSeen] = createSignal<Record<string, number>>({})
  const [busy, setBusy] = createSignal<Record<string, boolean>>({})
  const [flow, setFlow] = createSignal<Record<string, FlowEntry>>({})
  const [tab, setTab] = createSignal<OesTab>(kvReadOne(props.api, KV_TAB, "current", OES_TABS))
  const [omoTab, setOmoTab] = createSignal<OmoTab>(
    kvReadOne(props.api, KV_OMO_TAB, "works", OMO_TABS),
  )
  const dimensions = useTerminalDimensions()
  const [liveTools, setLiveTools] = createSignal<Record<string, ToolHit>>({})
  const [liveFiles, setLiveFiles] = createSignal<Record<string, FileView>>({})
  const [gitTick, setGitTick] = createSignal(0)

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

  const projectDir = () => props.api.state.path.directory ?? null
  const projectRoots = () => {
    const dir = projectDir()
    const tree = props.api.state.path.worktree ?? null
    return [dir, tree].filter((p): p is string => Boolean(p))
  }

  let watchedId = props.sessionId
  let monitor = startMonitor({
    sessionId: watchedId,
    projectRoot: projectDir(),
    onChange: apply,
  })

  const refresh = () => profile("scan", () => selfTime("scan", () => monitor.refresh()))

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
      monitor.stop()
      monitor = startMonitor({
        sessionId: id,
        projectRoot: projectDir(),
        onChange: apply,
      })
      queueMicrotask(hydrateDiff)
    })

  createEffect(on(() => props.sessionId, remount, { defer: true }))

  queueMicrotask(hydrateDiff)

  let debounce: ReturnType<typeof setTimeout> | null = null
  const onEvent = (...args: unknown[]) =>
    profile(
      "event",
      () =>
        selfTime("event", () => {
          const evt = args[0]
          const id = sessionIdFromEvent(evt) ?? props.sessionId
          const flag = sessionBusyFromEvent(evt)
          if (flag.busy !== false) bumpSeen(id)
          if (flag.id && flag.busy != null) {
            setBusy((prev) => ({ ...prev, [flag.id!]: flag.busy! }))
          } else if (flag.busy != null) {
            setBusy((prev) => ({ ...prev, [id]: flag.busy! }))
          }
          const hint = flowFromEvent(evt)
          const flowId = hint.id ?? id
          if (flowId && hint.dir) {
            const at = Date.now()
            setFlow((prev) => applyFlow(prev, flowId, hint.dir!, at))
          }
          const hit = toolHitFromEvent(evt)
          if (hit && (!hit.sessionId || hit.sessionId === props.sessionId)) {
            setLiveTools((prev) => ({ ...prev, [hit.id]: hit }))
          }
          ingestFiles(filesFromEvent(evt, props.sessionId, fileFilter(projectDir())))
          queueMicrotask(requestRender)
          if (!shouldRefreshDb(eventType(evt))) return
          if (debounce) clearTimeout(debounce)
          debounce = setTimeout(() => {
            debounce = null
            refresh()
          }, EVENT_SCAN_DEBOUNCE_MS)
        }),
      { type: eventType(args[0]) || undefined },
    )

  const listen = (type: string, fn: (...args: unknown[]) => void): (() => void) => {
    try {
      const on = props.api.event.on as (name: string, cb: (...args: unknown[]) => void) => unknown
      const off = on(type, (...args: unknown[]) => {
        const raw = args[0]
        if (raw && typeof raw === "object") {
          const o = raw as Record<string, unknown>
          if (typeof o.type !== "string" || !o.type) {
            fn({ type, properties: raw })
            return
          }
        } else {
          fn({ type, properties: raw ?? {} })
          return
        }
        fn(raw)
      })
      return typeof off === "function" ? (off as () => void) : () => {}
    } catch {
      return () => {}
    }
  }

  const offs = [
    listen("message.updated", onEvent),
    listen("message.part.updated", onEvent),
    listen("message.part.delta", onEvent),
    listen("session.status", onEvent),
    listen("session.idle", onEvent),
    listen("session.created", onEvent),
    listen("session.updated", onEvent),
    listen("session.next.step.started", onEvent),
    listen("session.next.step.ended", onEvent),
    listen("session.next.step.failed", onEvent),
    listen("session.next.text.started", onEvent),
    listen("session.next.text.delta", onEvent),
    listen("session.next.reasoning.started", onEvent),
    listen("session.next.reasoning.delta", onEvent),
    listen("session.next.tool.called", onEvent),
    listen("session.next.tool.success", onEvent),
    listen("session.next.tool.failed", onEvent),
    listen("session.diff", onEvent),
    listen("file.edited", onEvent),
    listen("tui.session.select", () => remount()),
  ]

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
      })
      tickCount += 1
      if (tickCount % FPS_READ_EVERY_TICKS === 0) {
        const r = readRendererFps(props.api.renderer)
        setSelfFps(r.fps, r.frameMs)
      }
    })
  }, TICK_MS)

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

  onCleanup(() => {
    if (debounce) clearTimeout(debounce)
    clearInterval(tick)
    monitor.stop()
    offGit()
    for (const off of offs) off()
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
  const foldOmo = useFold(props.api, KV_FOLD_OMO, { after: requestRender })

  const myWorkFold = {} as Record<MyWorkKind, ReturnType<typeof useFold>>
  for (const kind of MY_WORK_ORDER) {
    // The Errors group is noise until you want it — start collapsed.
    myWorkFold[kind] = useFold(props.api, `oes.fold.mywork.${kind}`, {
      after: requestRender,
      defaultOpen: kind !== QUESTION_KIND_ERROR,
    })
  }

  // Reveal state is hoisted, not owned by GroupSection: the My work and Docs
  // memos read the `now()` clock, so <For> reconciles them to fresh objects
  // every second — a reveal signal created inside the component would be
  // thrown away with it and the "… +N more" click would collapse on its own.
  const myWorkReveal = {} as Record<MyWorkKind, RevealState>
  for (const kind of MY_WORK_ORDER) {
    myWorkReveal[kind] = useReveal(2)
  }

  const docFold = {} as Record<DocKind, ReturnType<typeof useFold>>
  for (const kind of DOC_KIND_ORDER) {
    docFold[kind] = useFold(props.api, `oes.fold.docs.${kind}`, { after: requestRender })
  }

  const docReveal = {} as Record<DocKind, RevealState>
  for (const kind of DOC_KIND_ORDER) {
    docReveal[kind] = useReveal(2)
  }

  const oes = () => getOes(projectDir())
  const tools = createMemo(() => mergeTools(snap().db.tools, liveTools(), now(), oes().toolFetch))

  /**
   * Project-wide feed — tools/files from every main session. The DB queries run
   * only while the Sessions tab is open; elsewhere the memo stays empty.
   */
  const projectFeed = createMemo<ProjectFeed>(() => {
    if (tab() !== "sessions") return emptyProjectFeed()
    const db = snap().db
    return readProjectFeed({
      dbPath: db.dbPath,
      sessionIds: db.recent.map((s) => s.id),
      toolLimit: oes().toolFetch,
      filter: fileFilter(projectDir()),
    })
  })
  const projectFilesStat = createMemo(() => sumDiff(projectFeed().files))

  const [filesExpanded, setFilesExpanded] = createSignal(false)

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
    setTab(picked)
    kvWriteOne(props.api, KV_TAB, picked)
    if (picked === "current" || picked === "perf") refresh()
    requestRender()
  }

  const pickOmoTab = (next: string) => {
    if (!(OMO_TABS as readonly string[]).includes(next)) return
    const picked = next as OmoTab
    setOmoTab(picked)
    kvWriteOne(props.api, KV_OMO_TAB, picked)
    refresh()
    requestRender()
  }

  const omoPresent = createMemo(() => snap().omo.present)

  /**
   * Plan-file index for the "last plan" suffix. Built once per part change
   * (stamp-cached inside `planSessionIndex`); the memo only guards the DB
   * open + query on the render path. `sessionPlan` maps a session to its
   * latest `.omo/` plan/draft file.
   */
  const planIndex = createMemo(() => {
    const db = snap().db.present ? openReadonlyDb(snap().db.dbPath) : null
    if (!db) return null
    try {
      return planSessionIndex(db, snap().db.projectId, projectDir())
    } catch {
      return null
    }
  })

  /** `last plan: <slug>` for a session that wrote a plan; undefined otherwise. */
  const lastPlanSuffix = (sessionId: string | null | undefined): string | undefined => {
    const idx = planIndex()
    if (!idx || !sessionId) return undefined
    const plan = idx.sessionPlan.get(sessionId)
    if (!plan) return undefined
    return `last plan: ${approvalName(plan.rel)}`
  }

  /** Open `question` tools anywhere in this project — the "answer me" queue. */
  const myWorkQuestions = createMemo<MyWorkItem[]>(() => {
    if (tab() !== "mywork") return []
    const db = snap().db
    try {
      return toQuestionItems(listOpenQuestions({ dbPath: db.dbPath, projectId: db.projectId }))
    } catch (e) {
      dbg("mywork.questions", "error", String(e))
      return []
    }
  })

  /** OMO drafts/plans across all four states, enriched with planner-session state. */
  const myWorkApprovals = createMemo<MyWorkItem[]>(() => {
    if (tab() !== "mywork" || !omoPresent()) return []
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

  const myWorkItems = createMemo<MyWorkItem[]>(() => [
    ...myWorkQuestions(),
    ...myWorkApprovals(),
  ])

  const myWorkGroups = createMemo(() => groupMyWork(myWorkItems()))

  /** OMO `start work` — the command endpoint first, a plain chat message as fallback. */
  const runStartWork = (mode: StartWorkMode, planName: string): void => {
    const client = props.api.client
    const text = startWorkCommand(mode, planName)
    const flag = mode === START_WORK_MAKE_PR ? "--make-pr" : mode === START_WORK_SHIP ? "--ship" : ""
    const args = [planName, flag].map((s) => s.trim()).filter(Boolean).join(" ") || ""
    const go = async () => {
      try {
        const res = await client.session.command({
          sessionID: props.sessionId,
          command: "start-work",
          arguments: args,
        })
        if (res && !res.error) return
      } catch {
        // command not registered — send as a plain message below
      }
      try {
        await client.session.promptAsync({
          sessionID: props.sessionId,
          parts: [{ type: PART_TYPE_TEXT, text }],
        })
      } catch {
        // host without message send
      }
    }
    void profileAsync("rpc.startWork", go)
  }

  /** OMO plan approve — answer the writer session with the `ok` the planner waits for. */
  const approvePlan = (sessionId: string): void => {
    const client = props.api.client
    const go = async () => {
      try {
        await client.session.promptAsync({
          sessionID: sessionId,
          parts: [{ type: PART_TYPE_TEXT, text: "ok" }],
        })
      } catch {
        // host without message send
      }
    }
    void profileAsync("rpc.approve", go)
  }

  /**
   * Rows are handed out on every render: chrome that always costs a line is
   * counted first, then `packSections` splits what is left. OMO shares the
   * budget instead of pushing the core off screen, and folds itself to its
   * summary line when even its minimum no longer fits.
   */
  const rowPlan = createMemo(() => {
    try {
      const o = oes()
      const t = tab()
      const omo = omoPresent()
      const sections: { key: string; want: number; min: number; rank: number }[] = []
      let fixed = 3 // self status line + OES brand line + panel top padding
      if (modeLine()) fixed += 1 // debug/profile flag row
      if (modeDirLine()) fixed += 1
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

      if (omo) {
        fixed += 2 // blank row above the group + its brand line
        if (foldOmo.open() && o.omoRows > 0) {
          sections.push({ key: "omo", want: o.omoRows, min: ROW_MIN.omo, rank: ROW_RANK.omo })
        }
      }

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
  const worksReveal = useReveal(4)
  const boulderReveal = useReveal(4)
  const projectFilesReveal = useReveal(4)
  const delegateReveal = useReveal(4)
  const currentDelegatesReveal = useReveal(4)

  const omoRows = createMemo(() => (omoPresent() ? rowsFor("omo", 0) : 0))
  const omoOpen = createMemo(() => foldOmo.open() && omoRows() > 0)
  const works = createMemo(() => snap().omo.works)

  const workLines = createMemo((): RowData[] =>
    works().map((w) => {
      const row = workRowView(w, now())
      return {
        kind: ROW_KIND_AGENT,
        mark: row.mark,
        glyph: row.glyph ?? undefined,
        name: w.name,
        suffix: row.suffix,
        current: w.current,
        onSelect: () => openWorkDetail(props.api, w, projectRoots(), colors()),
      }
    }),
  )

  const omoSummary = createMemo(() => {
    const b = snap().omo.boulder
    const bits: string[] = []
    if (b.name) bits.push(b.name)
    if (b.counts.running > 0) bits.push(`${b.counts.running} run`)
    else if (b.counts.total > 0) bits.push(`${b.counts.done}/${b.counts.total} done`)
    const age = formatAge(pulseAgeMs(now(), b.updatedAt))
    if (age) bits.push(age)
    return clip(bits.join(" · ") || "no active work", oes().lineMax)
  })

  /** Boulder is the one place that knows where a plan lives. */
  const planPaths = createMemo(() => {
    const seen = new Set<string>()
    for (const w of works()) if (w.planPath) seen.add(w.planPath)
    return [...seen]
  })

  /** Scanned only while the tab is open; `readOmoDocs` caches for a few seconds. */
  const docs = createMemo(() => {
    if (!omoOpen() || omoTab() !== "docs") return []
    now()
    return readOmoDocs(projectDir(), planPaths())
  })

  const docGroups = createMemo(() => groupDocs(docs()))

  const docBudgets = createMemo(() => {
    try {
      const open = docGroups().filter((g) => docFold[g.kind].open())
      if (open.length === 0) return {} as Record<DocKind, number>
      return packSections(
        omoRows(),
        0,
        open.map((g) => ({ key: g.kind, want: g.items.length + 1, min: 1, rank: ROW_RANK.omo })),
      )
    } catch {
      return {} as Record<DocKind, number>
    }
  }, {} as Record<DocKind, number>)

  const docRow = (d: DocView): RowData => {
    const age = pulseAgeMs(now(), d.updatedAt)
    return {
      kind: ROW_KIND_FILE,
      mark: composeMark({ ageMs: age }),
      glyph: "•",
      name: d.name,
      suffix: formatAge(age),
      onSelect: () => openDocDetail(props.api, d, projectRoots(), colors()),
    }
  }

  const myWorkRow = (item: MyWorkItem): RowData => {
    if ("sessionId" in item) {
      const age = pulseAgeMs(now(), item.startedAt)
      const reason = item.reason ? ` · ${item.reason}` : ""
      return {
        kind: ROW_KIND_AGENT,
        mark: item.kind === QUESTION_KIND_ERROR ? STATUS_ERROR : MARK_READY,
        glyph: myWorkGlyph(item.kind),
        name: item.title,
        suffix: `${formatAge(age)}${reason}`,
        waiting: item.kind !== QUESTION_KIND_ERROR,
        onSelect: () => selectSession(props.api, item.sessionId),
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
      mark: MARK_READY,
      glyph: myWorkGlyph(item.kind),
      name: item.name,
      suffix: [sessionLabel, reviewLabel].filter(Boolean).join(" ") || undefined,
      waiting: !drafting,
      onSelect: () => {
        if (drafting) {
          openDocDetail(props.api, doc, projectRoots(), colors())
          return
        }
        const db = openReadonlyDb(snap().db.dbPath)
        const sessionId = db ? sessionForPlanFile(db, item.rel) : null
        openApprovalDialog(props.api, {
          title: item.name,
          sessionId,
          continueHint: approvalContinueHint(sessionId, Boolean(db)),
          onContinue: (sid) => selectSession(props.api, sid),
          onApprove: approvePlan,
          onStartWork: (mode) => runStartWork(mode, item.name),
          onDocs: () => openDocDetail(props.api, doc, projectRoots(), colors()),
          showApprove,
          showStartWork,
        })
      },
    }
  }

  /** The cockpit is a flat row list, so the row budget can just slice it. */
  const boulderLines = createMemo((): RowData[] => {
    const b = snap().omo.boulder
    if (!b.name && b.counts.total === 0 && b.sessions.length === 0) return []
    const header = b.status
      ? workRowView({ status: b.status, updatedAt: b.updatedAt }, now())
      : { mark: PULSE_IDLE as AgentMark, glyph: undefined, suffix: formatAge(pulseAgeMs(now(), b.updatedAt)) }
    const out: RowData[] = [
      {
        kind: ROW_KIND_AGENT,
        mark: header.mark,
        glyph: header.glyph ?? undefined,
        name: b.name || "work",
        suffix: header.suffix,
        current: true,
      },
    ]

    const meta = [b.agent, b.status ? workStatusLabel(b.status) : null]
      .filter((s): s is string => Boolean(s))
      .join(" · ")
    if (meta) out.push({ kind: ROW_KIND_GROUP, mark: MARK_READY, glyph: " ", name: meta })

    const task = currentTask(b)
    if (task) {
      out.push({
        kind: ROW_KIND_TOOL,
        mark: PULSE_LIVE,
        name: task.label || task.title,
        suffix:
          task.startedAt != null ? formatDuration(Math.max(0, now() - task.startedAt)) : undefined,
        flow: FLOW_TOOL,
      })
    }

    if (b.counts.total > 0) {
      const bits = [`${b.counts.running} run`, `${b.counts.done} done`]
      if (b.counts.other > 0) bits.push(`${b.counts.other} other`)
      out.push({ kind: ROW_KIND_GROUP, mark: MARK_READY, glyph: " ", name: bits.join(" · ") })
    }

    for (const s of b.sessions) {
      const sess = snap().db.byId[s.id]
      const archived = sess?.status === SESSION_STATUS_ARCHIVED
      out.push({
        kind: ROW_KIND_DELEGATE,
        mark: rowMark(
          archived ? STATUS_ARCHIVED : null,
          archived,
          Boolean(busy()[s.id]),
          sess?.timeUpdated,
          seen()[s.id],
        ),
        name: s.origin ? `${s.id.slice(0, 12)} · ${s.origin}` : s.id.slice(0, 12),
        current: s.id === props.sessionId,
        flow: rowFlow(s.id, Boolean(busy()[s.id])),
        onSelect: () => selectSession(props.api, s.id),
      })
    }
    return out
  })

  /** Perf SQLite scan runs only while this tab is open. */
  const perf = createMemo(() => {
    if (tab() !== "perf") return emptyPerf(props.sessionId)
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
          mark: hottestMark(item.members.map(delegateMark)),
          glyph: GROUP_GLYPH,
          name: `${agentDisplayName(item.agent)} (${item.count})`,
        })
        continue
      }
      const d = item.delegate
      const isBusy = Boolean(d.sessionId && busy()[d.sessionId])
      const waiting = isPendingWork(d.status)
      const mark = delegateMark(d)
      const dir = rowFlow(d.sessionId, isBusy)
      out.push({
        kind: item.grouped ? ROW_KIND_DELEGATE : ROW_KIND_AGENT,
        mark,
        glyph2: waiting ? (workStatusGlyph(d.status) ?? undefined) : undefined,
        waiting,
        name: item.grouped ? d.title || d.taskKey || "task" : d.agent || "agent",
        tokens: d.tokensTotal,
        title: item.grouped ? undefined : d.title,
        current: Boolean(d.sessionId && d.sessionId === props.sessionId),
        flow: dir,
        onSelect: () => selectSession(props.api, d.sessionId),
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
      <Show when={modeLine()}>
        <text fg={colors().warning || colors().text}>{modeLine()}</text>
      </Show>
      <Show when={modeDirLine()}>
        <text fg={colors().textMuted}>{modeDirLine()}</text>
      </Show>
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
              if (groups.length === 0) return <text fg={colors().textMuted}>• nothing</text>
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
                {snap().db.main ? (
                  <Row
                    kind={ROW_KIND_AGENT}
                    mark={mainMark()}
                    name={snap().db.main!.agent}
                    tokens={snap().db.main!.tokensTotal}
                    cost={snap().db.main!.cost}
                    suffix={lastPlanSuffix(snap().db.main?.id)}
                    current={snap().db.main!.id === props.sessionId}
                    flow={mainFlow()}
                    onSelect={() => selectSession(props.api, snap().db.main?.id)}
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
              { label: "new", onPick: () => newSession(props.api, projectDir()) },
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
                    suffix={
                      [formatAge(pulseAgeMs(now(), s.timeUpdated, seen()[s.id])), lastPlanSuffix(s.id)]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                    current={s.id === props.sessionId}
                    flow={dir}
                    onSelect={() => selectSession(props.api, s.id)}
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
            colors={colors()}
            onToggle={foldFiles.toggle}
          >
            <RowList
              items={projectFeed().files}
              budget={rowsFor("files", oes().fileRows) + projectFilesReveal.more()}
              colors={colors()}
              renderItem={(f) => (
                <Row
                  kind={ROW_KIND_FILE}
                  mark={fileLetterMark(f.letter)}
                  glyph={f.letter ?? "•"}
                  name={f.name}
                  diff={{ additions: f.additions, deletions: f.deletions }}
                  onSelect={() => openFileDetail(props.api, f, projectRoots(), colors())}
                />
              )}
              more={{ onReveal: projectFilesReveal.reveal }}
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
                {currentRow() ? (
                  <Row
                    kind={ROW_KIND_AGENT}
                    mark={currentMark()}
                    name={currentRow()!.agent}
                    tokens={currentRow()!.tokensTotal}
                    cost={currentRow()!.cost}
                    suffix={lastPlanSuffix(currentRow()?.id)}
                    current
                    flow={currentFlow()}
                    onSelect={() => selectSession(props.api, currentRow()?.id)}
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
            colors={colors()}
            onToggle={foldFiles.toggle}
          >
            {filesAll().length === 0 ? (
              <text fg={colors().textMuted}>• none</text>
            ) : (
              <RowList
                items={filesAll()}
                budget={
                  filesExpanded()
                    ? Number.POSITIVE_INFINITY
                    : rowsFor("files", oes().fileRows)
                }
                colors={colors()}
                renderItem={(f) => (
                  <Row
                    kind={ROW_KIND_FILE}
                    mark={fileLetterMark(f.letter)}
                    glyph={f.letter ?? "•"}
                    name={f.name}
                    diff={{ additions: f.additions, deletions: f.deletions }}
                    onSelect={() => openFileDetail(props.api, f, projectRoots(), colors())}
                  />
                )}
                more={{
                  onReveal: () => setFilesExpanded(true),
                  expanded: filesExpanded(),
                  onToggle: () => setFilesExpanded(false),
                }}
              />
            )}
          </FoldSection>
            </box>
          ),
          perf: () => (
            <PerfPanel
              api={props.api}
              perf={perf()}
              colors={colors()}
              lineMax={oes().lineMax}
              rows={oes().perfRows}
              frame={frame}
              livePhase={selfFlow()}
              livePhaseMs={selfPhaseMs()}
              currentSessionId={props.sessionId}
              dbPath={snap().db.dbPath}
              turns={oes().perfTurns}
              onSelect={(id) => selectSession(props.api, id)}
            />
          ),
        }}
      />

      <Show when={omoPresent()}>
        <TabColumn
          brand="OMO"
          tabs={OMO_TABS}
          labels={TAB_LABELS}
          active={omoTab()}
          colors={colors()}
          onPick={pickOmoTab}
          onBrand={foldOmo.toggle}
          indentContent
          gap={0}
          collapsed={!omoOpen()}
          summary={omoSummary()}
          panels={{
            works: () =>
              workLines().length === 0 ? (
                <text fg={colors().textMuted}>• none</text>
              ) : (
                <RowList
                  items={workLines()}
                  budget={omoRows() + worksReveal.more()}
                  colors={colors()}
                  renderItem={(r) => <Row {...r} />}
                  more={{ onReveal: worksReveal.reveal }}
                />
              ),
            boulder: () =>
              boulderLines().length === 0 ? (
                <text fg={colors().textMuted}>• no active work</text>
              ) : (
                <RowList
                  items={boulderLines()}
                  budget={omoRows() + boulderReveal.more()}
                  colors={colors()}
                  renderItem={(r) => <Row {...r} />}
                  more={{ onReveal: boulderReveal.reveal }}
                />
              ),
            docs: () => {
              const groups = docGroups()
              if (groups.length === 0) return <text fg={colors().textMuted}>• none</text>
              return (
                <box flexDirection="column" gap={1}>
                  <For each={groups}>
                    {(g) => (
                      <GroupSection
                        title={DOC_KIND_LABEL[g.kind]}
                        open={docFold[g.kind].open()}
                        onToggle={docFold[g.kind].toggle}
                        colors={colors()}
                        items={g.items}
                        budget={rowsForPlan(docBudgets(), g.kind, 0)}
                        reveal={docReveal[g.kind]}
                        renderItem={(d) => <Row {...docRow(d)} />}
                      />
                    )}
                  </For>
                </box>
              )
            },
          }}
        />
      </Show>

      {err() && snap().db.main ? (
        <text fg={colors().textMuted}>{err()}</text>
      ) : null}
    </box>
  )
}
