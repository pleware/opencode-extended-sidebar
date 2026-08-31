/** @jsxImportSource @opentui/solid */
import { createEffect, createMemo, createSignal, For, on, Show, onCleanup, type JSX } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import type { TuiPluginApi, TuiTheme } from "@opencode-ai/plugin/tui"
import {
  currentTask,
  emptyOmo,
  workRowView,
  workStatusLabel,
} from "./omo.js"
import { ROW_MIN, ROW_RANK, packSections, panelRows, sliceWithOverflow } from "./layout.js"
import { DOC_KIND_LABEL, groupDocs, readOmoDocs } from "./docs.js"
import { emptyDb, mergeTools } from "./db.js"
import {
  BrandTabs,
  DiffStat,
  FoldHeader,
  kvRead,
  kvReadOne,
  kvWriteOne,
  makeFoldToggle,
  type ThemeColors,
} from "./chrome.js"
import {
  delegatesForSession,
  groupDelegates,
  type DelegateView,
  type LiveSnapshot,
} from "./live.js"
import { emptyPerf, readPerfSnapshot } from "./perf.js"
import { PerfPanel } from "./perfview.js"
import {
  decorateFiles,
  fileFilter,
  filesFromEvent,
  formatDiffStat,
  mergeFiles,
  shortFileName,
  sumDiff,
  type FileLetter,
  type FileView,
} from "./files.js"
import { onGitMarksChange } from "./git.js"
import { getOes } from "./oes.js"
import { startMonitor } from "./monitor.js"
import { openDocDetail, openFileDetail, openToolDetail, openWorkDetail } from "./detail.js"
import { eventType, shouldRefreshDb } from "./events.js"
import { getOpenCodeDbPath } from "./paths.js"
import {
  TICK_MS,
  activeFlow,
  applyFlow,
  composeMark,
  flowBlinkOn,
  flowColor,
  flowFromEvent,
  formatAge,
  formatDuration,
  formatTokens,
  formatUsd,
  hottestMark,
  markGlyph,
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
} from "./pulse.js"

export type SidebarProps = {
  sessionId: string
  api: TuiPluginApi
  theme: TuiTheme
}

function fileLetterMark(letter: FileLetter | null | undefined): AgentMark {
  if (letter === "D" || letter === "U") return "error"
  if (letter === "M" || letter === "T" || letter === "R" || letter === "C") return "stale"
  if (letter === "A") return "live"
  return "ready"
}

function markColor(
  mark: AgentMark,
  colors: ThemeColors,
  current = false,
  flow?: FlowDir | null,
): string {
  if (flow === "recv" || flow === "wait" || flow === "tool") return flowColor(flow, colors)
  if (mark === "live") return colors.success
  if (mark === "stale") return colors.warning || colors.text
  if (mark === "error") return colors.error || colors.text
  if (current) return colors.primary || colors.text
  return colors.textMuted
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  if (max <= 0) return ""
  if (t.length <= max) return t
  if (max === 1) return "…"
  return `${t.slice(0, max - 1)}…`
}

type RowKind = "agent" | "tool" | "file" | "delegate" | "group"

function agentDisplayName(name: string): string {
  return (name || "agent").replace(/\s*-\s*/g, " ").trim() || "agent"
}

function shortName(name: string, kind: RowKind, max: number): string {
  if (kind === "file") return shortFileName(name, max)
  if (kind === "agent" || kind === "group") return clip(agentDisplayName(name), max)
  return clip((name || "agent").replace(/\s+/g, " ").trim(), max)
}

type RowData = {
  kind: RowKind
  mark: AgentMark
  name: string
  glyph?: string
  tokens?: number | null
  cost?: number | null
  title?: string
  suffix?: string
  diff?: { additions: number; deletions: number }
  current?: boolean
  flow?: FlowDir | null
  onSelect?: () => void
}

/** Single renderer for every sidebar row: glyph, name, tokens, title, suffix, diff. */
function AgentLine(props: RowData & {
  lineMax: number
  frame?: number
  colors: ThemeColors
}): JSX.Element {
  const directional = () =>
    props.flow === "recv" || props.flow === "wait" || props.flow === "tool"
  const lit = () => !directional() || flowBlinkOn(props.frame ?? 0)
  const glyphFg = () =>
    lit()
      ? markColor(props.mark, props.colors, props.current, props.flow)
      : props.colors.textMuted
  const bodyFg = () =>
    props.kind === "file"
      ? props.colors.text
      : props.kind === "group"
        ? props.colors.textMuted
        : markColor(props.mark, props.colors, props.current, props.flow)
  const rest = () => {
    const max = Math.max(0, props.lineMax - 2)
    const suffix = props.suffix?.trim() ?? ""
    const diffW = props.diff ? formatDiffStat(props.diff.additions, props.diff.deletions).length : 0
    const extra = (suffix ? suffix.length + 1 : 0) + (diffW ? diffW + 1 : 0)
    const room = Math.max(0, max - extra)
    const tok = props.tokens === undefined ? "" : formatTokens(props.tokens)
    const usd = formatUsd(props.cost)
    const meta = [tok, usd].filter(Boolean).join(" ")
    const metaW = meta ? meta.length + 1 : 0
    const title = props.title?.replace(/\s+/g, " ").trim()
    // One budget (`lineMax`): identity + meta (+ optional title) clipped once to `room`.
    const nameBudget = title
      ? Math.max(4, Math.floor((room - metaW) / 2))
      : Math.max(1, room - metaW)
    const agent = shortName(props.name, props.kind, nameBudget)
    const head = [agent, tok, usd].filter(Boolean).join(" ")
    const body = !title
      ? clip(head, room)
      : room - head.length < 9
        ? clip(head, room)
        : clip(`${head} ${title}`, room)
    return suffix ? `${body} ${suffix}` : body
  }
  return (
    <box flexDirection="row" onMouseUp={props.onSelect}>
      <text fg={glyphFg()}>{`${props.glyph ?? markGlyph(props.mark, props.frame ?? 0, props.flow)} `}</text>
      <text fg={bodyFg()} bold={Boolean(props.current)} underline={Boolean(props.onSelect)}>
        {rest()}
      </text>
      <Show when={Boolean(props.diff && (props.diff.additions > 0 || props.diff.deletions > 0))}>
        <text> </text>
        <DiffStat
          additions={props.diff?.additions ?? 0}
          deletions={props.diff?.deletions ?? 0}
          colors={props.colors}
        />
      </Show>
    </box>
  )
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
  void go()
}

const KV_FOLD_AGENTS = "oes.fold.agents"
const KV_FOLD_DELEGATES = "oes.fold.delegates"
const KV_FOLD_SESSIONS = "oes.fold.sessions"
const KV_FOLD_TOOLS = "oes.fold.tools"
const KV_FOLD_FILES = "oes.fold.files"
const KV_FOLD_OMO = "oes.fold.omo"
const KV_TAB = "oes.tab"
const KV_OMO_TAB = "oes.omoTab"

/** Two independent groups: OES is the core, OMO is an optional add-on below it. */
const OES_TABS = ["sessions", "current", "perf"] as const
const OMO_TABS = ["works", "boulder", "docs"] as const
type OesTab = (typeof OES_TABS)[number]
type OmoTab = (typeof OMO_TABS)[number]

const TAB_LABELS: Record<string, string> = {
  sessions: "Sessions",
  current: "Current",
  perf: "Perf",
  works: "Works",
  boulder: "Boulder",
  docs: "Docs",
}

function emptyLive(): LiveSnapshot {
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
  const [snap, setSnap] = createSignal<LiveSnapshot>(emptyLive())
  const [now, setNow] = createSignal(Date.now())
  const [frame, setFrame] = createSignal(0)
  const [seen, setSeen] = createSignal<Record<string, number>>({})
  const [busy, setBusy] = createSignal<Record<string, boolean>>({})
  const [flow, setFlow] = createSignal<Record<string, FlowEntry>>({})
  const [foldAgents, setFoldAgents] = createSignal(kvRead(props.api, KV_FOLD_AGENTS, false))
  const [foldDelegates, setFoldDelegates] = createSignal(
    kvRead(props.api, KV_FOLD_DELEGATES, false),
  )
  const [foldSessions, setFoldSessions] = createSignal(
    kvRead(props.api, KV_FOLD_SESSIONS, false),
  )
  const [foldTools, setFoldTools] = createSignal(kvRead(props.api, KV_FOLD_TOOLS, false))
  const [foldFiles, setFoldFiles] = createSignal(kvRead(props.api, KV_FOLD_FILES, false))
  const [foldOmo, setFoldOmo] = createSignal(kvRead(props.api, KV_FOLD_OMO, false))
  const [tab, setTab] = createSignal<OesTab>(kvReadOne(props.api, KV_TAB, "sessions", OES_TABS))
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
      props.api.renderer.requestRender()
    } catch {
      // teardown
    }
  }

  const bumpSeen = (id: string | null | undefined) => {
    if (!id) return
    setSeen((prev) => ({ ...prev, [id]: Date.now() }))
  }

  const apply = (next: LiveSnapshot) => {
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

  const ingestFiles = (hits: FileView[]) => {
    if (!hits.length) return
    setLiveFiles((prev) => {
      const next = { ...prev }
      for (const f of hits) next[f.id] = f
      return next
    })
  }

  const hydrateDiff = () => {
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
      void Promise.resolve()
        .then(() => fn({ path: { id: props.sessionId } }))
        .catch(() => fn({ sessionID: props.sessionId }))
        .then(take)
        .catch(() => {})
    } catch {
      // host client without session.diff
    }
  }

  /** Rebind to the session the props point at. A stale select event only nudges a refresh. */
  const remount = () => {
    const id = props.sessionId
    if (id === watchedId) {
      monitor.refresh()
      return
    }
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
  }

  createEffect(on(() => props.sessionId, remount, { defer: true }))

  queueMicrotask(hydrateDiff)

  let debounce: ReturnType<typeof setTimeout> | null = null
  const onEvent = (...args: unknown[]) => {
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
      monitor.refresh()
    }, 100)
  }

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

  const tick = setInterval(() => {
    setNow(Date.now())
    setFrame((n) => n + 1)
  }, TICK_MS)

  const offGit = onGitMarksChange(() => {
    setGitTick((n) => n + 1)
    queueMicrotask(requestRender)
  })

  createEffect(() => {
    frame()
    now()
    flow()
    liveTools()
    liveFiles()
    queueMicrotask(requestRender)
  })

  onCleanup(() => {
    if (debounce) clearTimeout(debounce)
    clearInterval(tick)
    monitor.stop()
    offGit()
    for (const off of offs) off()
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
    if (!m) return "queued" as AgentMark
    return rowMark(
      m.status === "archived" ? "archived" : null,
      m.status === "archived",
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
    if (!c) return "queued" as AgentMark
    return rowMark(
      c.status === "archived" ? "archived" : null,
      c.status === "archived",
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
      if (m === "live" || m === "stale") n += 1
    }
    return n
  })

  const toggleAgents = makeFoldToggle(props.api, KV_FOLD_AGENTS, setFoldAgents, requestRender)
  const toggleDelegates = makeFoldToggle(
    props.api,
    KV_FOLD_DELEGATES,
    setFoldDelegates,
    requestRender,
  )
  const toggleTools = makeFoldToggle(props.api, KV_FOLD_TOOLS, setFoldTools, requestRender)

  const oes = () => getOes(projectDir())
  const tools = createMemo(() => mergeTools(snap().db.tools, liveTools(), now(), oes().toolRows))

  const toolsLive = createMemo(() => {
    let n = 0
    for (const t of tools()) {
      if (t.status === "running" || t.status === "pending") n += 1
    }
    return n
  })

  const toggleSessions = makeFoldToggle(props.api, KV_FOLD_SESSIONS, setFoldSessions, requestRender)
  const toggleFiles = makeFoldToggle(props.api, KV_FOLD_FILES, setFoldFiles, requestRender)

  const filesAll = createMemo(() => {
    gitTick()
    return decorateFiles(mergeFiles(snap().db.files ?? [], liveFiles()), projectDir(), {
      git: tab() === "current" && !foldFiles(),
    })
  })
  const filesStat = createMemo(() => sumDiff(filesAll()))

  const pickTab = (next: string) => {
    if (!(OES_TABS as readonly string[]).includes(next)) return
    const picked = next as OesTab
    setTab(picked)
    kvWriteOne(props.api, KV_TAB, picked)
    if (picked === "current" || picked === "perf") monitor.refresh()
    requestRender()
  }

  const pickOmoTab = (next: string) => {
    if (!(OMO_TABS as readonly string[]).includes(next)) return
    const picked = next as OmoTab
    setOmoTab(picked)
    kvWriteOne(props.api, KV_OMO_TAB, picked)
    monitor.refresh()
    requestRender()
  }

  const toggleOmo = makeFoldToggle(props.api, KV_FOLD_OMO, setFoldOmo, requestRender)

  const omoPresent = createMemo(() => snap().omo.present)

  /**
   * Rows are handed out on every render: chrome that always costs a line is
   * counted first, then `packSections` splits what is left. OMO shares the
   * budget instead of pushing the core off screen, and folds itself to its
   * summary line when even its minimum no longer fits.
   */
  const rowPlan = createMemo(() => {
    const o = oes()
    const t = tab()
    const omo = omoPresent()
    const sections: { key: string; want: number; min: number; rank: number }[] = []
    let fixed = 2 // OES brand line + panel top padding
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
      fixed += foldAgents() ? 0 : 1
      section(foldSessions(), "sessions", o.sessionRows, ROW_MIN.sessions, ROW_RANK.sessions)
      if (omo) section(foldDelegates(), "delegates", 6, ROW_MIN.delegates, ROW_RANK.delegates)
    } else if (t === "current") {
      header()
      fixed += foldAgents() ? 0 : 1
      section(foldDelegates(), "delegates", 6, ROW_MIN.delegates, ROW_RANK.delegates)
      section(foldTools(), "tools", o.toolRows, ROW_MIN.tools, ROW_RANK.tools)
      section(foldFiles(), "files", o.fileRows, ROW_MIN.files, ROW_RANK.files)
    } else {
      // Perf lays out its own sections and already caps itself with perfRows.
      fixed += 18
    }
    fixed += Math.max(0, blocks - 1) // one blank row between OES sections

    if (omo) {
      fixed += 2 // blank row above the group + its brand line
      if (!foldOmo() && o.omoRows > 0) {
        sections.push({ key: "omo", want: o.omoRows, min: ROW_MIN.omo, rank: ROW_RANK.omo })
      }
    }

    return packSections(panelRows(dimensions().height), fixed, sections)
  })

  const rowsFor = (key: string, fallback: number): number => {
    const v = rowPlan()[key]
    return typeof v === "number" ? v : fallback
  }

  const files = createMemo(() => filesAll().slice(0, rowsFor("files", oes().fileRows)))
  const omoRows = createMemo(() => (omoPresent() ? rowsFor("omo", 0) : 0))
  const omoOpen = createMemo(() => !foldOmo() && omoRows() > 0)
  const works = createMemo(() => snap().omo.works)

  const workLines = createMemo((): RowData[] =>
    works().map((w) => {
      const row = workRowView(w, now())
      return {
        kind: "agent" as const,
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

  const docLines = createMemo((): RowData[] => {
    const out: RowData[] = []
    for (const group of groupDocs(docs())) {
      out.push({
        kind: "group",
        mark: "ready",
        glyph: "▾",
        name: `${DOC_KIND_LABEL[group.kind]} (${group.items.length})`,
      })
      for (const d of group.items) {
        const age = pulseAgeMs(now(), d.updatedAt)
        out.push({
          kind: "file",
          mark: composeMark({ ageMs: age }),
          glyph: "•",
          name: d.name,
          suffix: formatAge(age),
          onSelect: () => openDocDetail(props.api, d, projectRoots(), colors()),
        })
      }
    }
    return out
  })

  /** The cockpit is a flat row list, so the row budget can just slice it. */
  const boulderLines = createMemo((): RowData[] => {
    const b = snap().omo.boulder
    if (!b.name && b.counts.total === 0 && b.sessions.length === 0) return []
    const header = b.status
      ? workRowView({ status: b.status, updatedAt: b.updatedAt }, now())
      : { mark: "queued" as const, glyph: "○", suffix: formatAge(pulseAgeMs(now(), b.updatedAt)) }
    const out: RowData[] = [
      {
        kind: "agent",
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
    if (meta) out.push({ kind: "group", mark: "ready", glyph: " ", name: meta })

    const task = currentTask(b)
    if (task) {
      out.push({
        kind: "tool",
        mark: "live",
        name: task.label || task.title,
        suffix:
          task.startedAt != null ? formatDuration(Math.max(0, now() - task.startedAt)) : undefined,
        flow: "tool",
      })
    }

    if (b.counts.total > 0) {
      const bits = [`${b.counts.running} run`, `${b.counts.done} done`]
      if (b.counts.other > 0) bits.push(`${b.counts.other} other`)
      out.push({ kind: "group", mark: "ready", glyph: " ", name: bits.join(" · ") })
    }

    for (const s of b.sessions) {
      const sess = snap().db.byId[s.id]
      const archived = sess?.status === "archived"
      out.push({
        kind: "delegate",
        mark: rowMark(
          archived ? "archived" : null,
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
      frame={frame()}
      colors={colors()}
    />
  )

  /** Every OMO tab draws through here, so the row budget is applied once. */
  const OmoRows = (rows: RowData[]): JSX.Element => {
    const cut = sliceWithOverflow(rows, omoRows())
    return (
      <box flexDirection="column" gap={0}>
        <For each={cut.rows}>{(line) => <Row {...line} />}</For>
        <Show when={cut.hidden > 0}>
          <text fg={colors().textMuted}>{`  … +${cut.hidden} more`}</text>
        </Show>
      </box>
    )
  }

  const DelegateRows = (list: DelegateView[], limit: number): JSX.Element => (
    <For each={groupDelegates(list).slice(0, Math.max(0, limit))}>
      {(item) => {
        if (item.kind === "header") {
          return (
            <Row
              kind="group"
              mark={hottestMark(item.members.map(delegateMark))}
              glyph="▾"
              name={`${agentDisplayName(item.agent)} (${item.count})`}
            />
          )
        }
        const d = item.delegate
        const isBusy = Boolean(d.sessionId && busy()[d.sessionId])
        const mark = delegateMark(d)
        const dir = rowFlow(d.sessionId, isBusy)
        return (
          <Row
            kind={item.grouped ? "delegate" : "agent"}
            mark={mark}
            name={item.grouped ? d.title || d.taskKey || "task" : d.agent || "agent"}
            tokens={d.tokensTotal}
            title={item.grouped ? undefined : d.title}
            current={Boolean(d.sessionId && d.sessionId === props.sessionId)}
            flow={dir}
            onSelect={() => selectSession(props.api, d.sessionId)}
          />
        )
      }}
    </For>
  )

  return (
    <box flexDirection="column" gap={1} paddingTop={1}>
      <BrandTabs
        brand="OES"
        tabs={OES_TABS}
        labels={TAB_LABELS}
        active={tab()}
        colors={colors()}
        onPick={pickTab}
      />
      <box flexDirection="column" gap={1} paddingLeft={1}>
        <Show when={tab() === "sessions"}>
        <box flexDirection="column" gap={1}>
        <box flexDirection="column" gap={0}>
          <FoldHeader
            title="Agents"
            open={!foldAgents()}
            colors={colors()}
            onToggle={toggleAgents}
          />
          <Show when={!foldAgents()}>
            <box flexDirection="column" gap={0} paddingLeft={1}>
              {snap().db.main ? (
                <Row
                  kind="agent"
                  mark={mainMark()}
                  name={snap().db.main!.agent}
                  tokens={snap().db.main!.tokensTotal}
                  cost={snap().db.main!.cost}
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
            </box>
          </Show>
        </box>

        <Show when={snap().db.recent.length > 0}>
          <box flexDirection="column" gap={0}>
            <FoldHeader
              title="Sessions"
              open={!foldSessions()}
              count={snap().db.recent.length}
              colors={colors()}
              onToggle={toggleSessions}
            />
            <Show when={!foldSessions()}>
              <box flexDirection="column" gap={0} paddingLeft={1}>
                <For each={snap().db.recent.slice(0, rowsFor("sessions", oes().sessionRows))}>
                  {(s) => {
                    const isBusy = Boolean(busy()[s.id])
                    const mark = rowMark(
                      s.status === "archived" ? "archived" : null,
                      s.status === "archived",
                      isBusy,
                      s.timeUpdated,
                      seen()[s.id],
                    )
                    const dir = rowFlow(s.id, isBusy)
                    return (
                      <Row
                        kind="agent"
                        mark={mark}
                        name={s.title}
                        suffix={formatAge(pulseAgeMs(now(), s.timeUpdated, seen()[s.id]))}
                        current={s.id === props.sessionId}
                        flow={dir}
                        onSelect={() => selectSession(props.api, s.id)}
                      />
                    )
                  }}
                </For>
              </box>
            </Show>
          </box>
        </Show>

        <Show when={snap().omo.present}>
          <box flexDirection="column" gap={0}>
            <FoldHeader
              title="Delegates"
              open={!foldDelegates()}
              count={snap().delegates.length}
              live={delegatesLive()}
              colors={colors()}
              onToggle={toggleDelegates}
            />
            <Show when={!foldDelegates()}>
              <box flexDirection="column" gap={0} paddingLeft={1}>
                {snap().delegates.length === 0 ? (
                  <text fg={colors().textMuted}>• none</text>
                ) : (
                  DelegateRows(snap().delegates, rowsFor("delegates", 6))
                )}
              </box>
            </Show>
          </box>
        </Show>
        </box>
        </Show>

        <Show when={tab() === "current"}>
        <box flexDirection="column" gap={1}>
        <box flexDirection="column" gap={0}>
          <FoldHeader
            title="Agents"
            open={!foldAgents()}
            colors={colors()}
            onToggle={toggleAgents}
          />
          <Show when={!foldAgents()}>
            <box flexDirection="column" gap={0} paddingLeft={1}>
              {currentRow() ? (
                <Row
                  kind="agent"
                  mark={currentMark()}
                  name={currentRow()!.agent}
                  tokens={currentRow()!.tokensTotal}
                  cost={currentRow()!.cost}
                  current
                  flow={currentFlow()}
                  onSelect={() => selectSession(props.api, currentRow()?.id)}
                />
              ) : (
                <text fg={colors().textMuted}>
                  {`• session · ${props.sessionId.slice(0, 14)}`}
                </text>
              )}
            </box>
          </Show>
        </box>

        <Show when={snap().omo.present || sessionDelegates().length > 0}>
          <box flexDirection="column" gap={0}>
            <FoldHeader
              title="Delegates"
              open={!foldDelegates()}
              count={sessionDelegates().length}
              live={sessionDelegates().filter((d) => {
                const m = delegateMark(d)
                return m === "live" || m === "stale"
              }).length}
              colors={colors()}
              onToggle={toggleDelegates}
            />
            <Show when={!foldDelegates()}>
              <box flexDirection="column" gap={0} paddingLeft={1}>
                {sessionDelegates().length === 0 ? (
                  <text fg={colors().textMuted}>• none</text>
                ) : (
                  DelegateRows(sessionDelegates(), rowsFor("delegates", 6))
                )}
              </box>
            </Show>
          </box>
        </Show>

        <box flexDirection="column" gap={0}>
          <FoldHeader
            title="Tools"
            open={!foldTools()}
            count={tools().length > 0 ? tools().length : undefined}
            live={toolsLive()}
            colors={colors()}
            onToggle={toggleTools}
          />
          <Show when={!foldTools()}>
            <box flexDirection="column" gap={0} paddingLeft={1}>
              {tools().length === 0 ? (
                <text fg={colors().textMuted}>• none</text>
              ) : (
                <For each={tools().slice(0, rowsFor("tools", oes().toolRows))}>
                  {(t) => {
                    const mark = toolMark(t.status)
                    const dir = toolFlow(t.status)
                    const dur =
                      t.status === "running" && t.startedAt != null
                        ? formatDuration(Math.max(0, now() - t.startedAt))
                        : formatDuration(t.durationMs)
                    return (
                      <Row
                        kind="tool"
                        mark={mark}
                        name={t.name}
                        suffix={dur}
                        flow={dir}
                        onSelect={() => openToolDetail(props.api, t, colors())}
                      />
                    )
                  }}
                </For>
              )}
            </box>
          </Show>
        </box>

        <box flexDirection="column" gap={0}>
          <FoldHeader
            title="Files"
            open={!foldFiles()}
            count={filesAll().length > 0 ? filesAll().length : undefined}
            diff={filesStat()}
            colors={colors()}
            onToggle={toggleFiles}
          />
          <Show when={!foldFiles()}>
            <box flexDirection="column" gap={0} paddingLeft={1}>
              {files().length === 0 ? (
                <text fg={colors().textMuted}>• none</text>
              ) : (
                <For each={files()}>
                  {(f) => (
                    <Row
                      kind="file"
                      mark={fileLetterMark(f.letter)}
                      glyph={f.letter ?? "•"}
                      name={f.name}
                      diff={{ additions: f.additions, deletions: f.deletions }}
                      onSelect={() => openFileDetail(props.api, f, projectRoots(), colors())}
                    />
                  )}
                </For>
              )}
            </box>
          </Show>
        </box>
        </box>
        </Show>

        <Show when={tab() === "perf"}>
          <PerfPanel
            api={props.api}
            perf={perf()}
            colors={colors()}
            lineMax={oes().lineMax}
            rows={oes().perfRows}
            frame={frame()}
            livePhase={selfFlow()}
            livePhaseMs={selfPhaseMs()}
            currentSessionId={props.sessionId}
            dbPath={snap().db.dbPath}
            turns={oes().perfTurns}
            onSelect={(id) => selectSession(props.api, id)}
          />
        </Show>
      </box>

      <Show when={omoPresent()}>
        <Show
          when={omoOpen()}
          fallback={
            <box flexDirection="row" onMouseUp={toggleOmo}>
              <text fg={colors().primary || colors().text} bold underline>
                ▶ OMO
              </text>
              <text fg={colors().textMuted}>{`  ${omoSummary()}`}</text>
            </box>
          }
        >
          <box flexDirection="column" gap={0}>
            <BrandTabs
              brand="▼ OMO"
              tabs={OMO_TABS}
              labels={TAB_LABELS}
              active={omoTab()}
              colors={colors()}
              onPick={pickOmoTab}
              onBrand={toggleOmo}
            />
            <box flexDirection="column" gap={0} paddingLeft={1}>
              <Show when={omoTab() === "works"}>
                {workLines().length === 0 ? (
                  <text fg={colors().textMuted}>• none</text>
                ) : (
                  OmoRows(workLines())
                )}
              </Show>
              <Show when={omoTab() === "boulder"}>
                {boulderLines().length === 0 ? (
                  <text fg={colors().textMuted}>• no active work</text>
                ) : (
                  OmoRows(boulderLines())
                )}
              </Show>
              <Show when={omoTab() === "docs"}>
                {docLines().length === 0 ? (
                  <text fg={colors().textMuted}>• none</text>
                ) : (
                  OmoRows(docLines())
                )}
              </Show>
            </box>
          </box>
        </Show>
      </Show>

      {err() && snap().db.main ? (
        <text fg={colors().textMuted}>{err()}</text>
      ) : null}
    </box>
  )
}
