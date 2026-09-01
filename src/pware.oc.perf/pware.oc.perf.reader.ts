/**
 * Turn timing from opencode.db: wait / think / recv / tool split per model.
 * Reads through json_extract, so only numbers and statuses leave SQLite —
 * message text, reasoning text and tool I/O never enter the process.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { dbg, profile } from "../pware.oc.core/pware.oc.core.debug.js"
import { createStampCache } from "../pware.oc.core/pware.oc.core.cache.js"
import { finiteNum } from "../pware.oc.core/pware.oc.core.paths.js"
import { formatDuration, formatWhen, shortToolLabel, toEpochMs } from "../pware.oc.core/pware.oc.core.pulse.js"
import { openReadonlyDb, withDbRead, type SqlDb } from "../pware.oc.core/pware.oc.core.sqlite.js"
import { PART_TYPE_REASONING, PART_TYPE_TEXT, PART_TYPE_TOOL } from "../pware.oc.core/constants/pware.oc.core.constants.partType.js"
import { TOOL_QUESTION } from "../pware.oc.core/constants/pware.oc.core.constants.toolName.js"
import {
  PERF_LOG_KIND_MODELS,
  PERF_LOG_KIND_TIME,
  PERF_PHASE_IDLE,
  PERF_PHASE_RECV,
  PERF_PHASE_THINK,
  PERF_PHASE_TOOL,
  PERF_PHASE_WAIT,
  type PerfLogKind,
  type PerfPhase,
} from "../pware.oc.core/constants/pware.oc.core.constants.phase.js"

export type { PerfLogKind, PerfPhase }

export type PhaseSplit = Record<PerfPhase, number>

export type ModelPerf = {
  key: string
  model: string
  provider: string
  turns: number
  /** Averages per turn, null when nothing was measurable. */
  waitMs: number | null
  thinkMs: number | null
  recvMs: number | null
  turnMs: number | null
  tokensPerSec: number | null
  toolMs: number
  tools: number
  errors: number
  tokensIn: number
  tokensOut: number
  tokensReasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  lastAt: number
}

export type ToolPerf = {
  name: string
  count: number
  errors: number
  totalMs: number
  avgMs: number
}

export type PerfTotals = {
  turns: number
  errors: number
  aborts: number
  wallMs: number
  activeMs: number
  phases: PhaseSplit
  tokensIn: number
  tokensOut: number
  tokensReasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  /** cacheRead / (input + cacheRead), null when nothing was sent yet. */
  cacheHit: number | null
}

/** One assistant turn, oldest first, for the trend charts. */
export type TrendPoint = {
  at: number
  waitMs: number | null
  tokensPerSec: number | null
}

export type SessionPerf = {
  id: string
  title: string
  model: string
  turns: number
  waitMs: number | null
  tokensPerSec: number | null
  toolShare: number | null
}

export type PerfSnapshot = {
  present: boolean
  sessionId: string
  totals: PerfTotals
  models: ModelPerf[]
  tools: ToolPerf[]
  trend: TrendPoint[]
  history: SessionPerf[]
  error: string | null
}

function emptyPhases(): PhaseSplit {
  return { wait: 0, think: 0, recv: 0, tool: 0, idle: 0 }
}

export function emptyPerf(sessionId: string, error: string | null = null): PerfSnapshot {
  return {
    present: false,
    sessionId,
    totals: {
      turns: 0,
      errors: 0,
      aborts: 0,
      wallMs: 0,
      activeMs: 0,
      phases: emptyPhases(),
      tokensIn: 0,
      tokensOut: 0,
      tokensReasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      cacheHit: null,
    },
    models: [],
    tools: [],
    trend: [],
    history: [],
    error,
  }
}

const MSG_SQL = `
  SELECT id,
         json_extract(data,'$.role')               AS role,
         json_extract(data,'$.modelID')            AS model,
         json_extract(data,'$.providerID')         AS provider,
         json_extract(data,'$.time.created')       AS created,
         json_extract(data,'$.time.completed')     AS completed,
         json_extract(data,'$.error.name')         AS err,
         json_extract(data,'$.tokens.input')       AS tin,
         json_extract(data,'$.tokens.output')      AS tout,
         json_extract(data,'$.tokens.reasoning')   AS treason,
         json_extract(data,'$.tokens.cache.read')  AS cread,
         json_extract(data,'$.tokens.cache.write') AS cwrite,
         json_extract(data,'$.cost')               AS cost
  FROM message
  WHERE session_id = ?
  ORDER BY time_created DESC
  LIMIT ?`

const PART_SQL = `
  SELECT message_id                              AS mid,
         json_extract(data,'$.type')             AS kind,
         json_extract(data,'$.time.start')       AS pstart,
         json_extract(data,'$.time.end')         AS pend,
         json_extract(data,'$.tool')             AS tool,
         json_extract(data,'$.state.status')     AS status,
         json_extract(data,'$.state.time.start') AS tstart,
         json_extract(data,'$.state.time.end')   AS tend
  FROM part
  WHERE session_id = ?
  ORDER BY time_created DESC
  LIMIT ?`

/** On-click log only — same hint columns as Current tools, never the blob. */
const LOG_PART_SQL = `
  SELECT message_id                                    AS mid,
         json_extract(data,'$.type')                   AS kind,
         json_extract(data,'$.time.start')             AS pstart,
         json_extract(data,'$.time.end')               AS pend,
         json_extract(data,'$.tool')                   AS tool,
         json_extract(data,'$.state.status')           AS status,
         json_extract(data,'$.state.time.start')       AS tstart,
         json_extract(data,'$.state.time.end')         AS tend,
         json_extract(data,'$.state.title')            AS title,
         json_extract(data,'$.state.input.command')    AS command,
         json_extract(data,'$.input.command')          AS command2,
         json_extract(data,'$.state.input.filePath')   AS filePath,
         json_extract(data,'$.input.filePath')         AS filePath2,
         json_extract(data,'$.state.input.pattern')    AS pattern,
         json_extract(data,'$.input.pattern')          AS pattern2,
         json_extract(data,'$.state.input.description') AS description,
         json_extract(data,'$.input.description')      AS description2,
         json_extract(data,'$.state.input.subagent_type') AS subagent,
         json_extract(data,'$.state.input.category')   AS category
  FROM part
  WHERE session_id = ?
  ORDER BY time_created DESC
  LIMIT ?`

export type MsgRow = {
  id: string
  role: string | null
  model: string | null
  provider: string | null
  created: number | null
  completed: number | null
  err: string | null
  tin: number | null
  tout: number | null
  treason: number | null
  cread: number | null
  cwrite: number | null
  cost: number | null
}

export type PartRow = {
  mid: string
  kind: string | null
  pstart: number | null
  pend: number | null
  tool: string | null
  status: string | null
  tstart: number | null
  tend: number | null
  /** Log-only hints — absent on the live PART_SQL scan. */
  title?: string | null
  command?: string | null
  filePath?: string | null
  pattern?: string | null
  description?: string | null
  subagent?: string | null
}

/** Per-message timing collected from its parts. */
type Bucket = {
  firstOut: number | null
  textStart: number | null
  textEnd: number | null
  thinkMs: number
  toolMs: number
  tools: number
  toolErrors: number
}

function num(v: unknown): number {
  return finiteNum(v)
}


function span(from: number | null, to: number | null): number {
  if (from == null || to == null || to < from) return 0
  return to - from
}

function newBucket(): Bucket {
  return {
    firstOut: null,
    textStart: null,
    textEnd: null,
    thinkMs: 0,
    toolMs: 0,
    tools: 0,
    toolErrors: 0,
  }
}

function avg(total: number, n: number): number | null {
  return n > 0 ? Math.round(total / n) : null
}

/** Tools that pause for a human rather than do work — never tool timing. */
const NON_TOOLS = new Set<string>([TOOL_QUESTION])

function countsAsTool(tool: string | null | undefined): boolean {
  return !NON_TOOLS.has((tool || "").trim().toLowerCase())
}

/** Drop the provider prefix; keep the tail, which carries the variant. */
function modelLabel(provider: string | null, model: string | null): string {
  const m = (model || "").trim()
  if (m) return m
  return (provider || "model").trim() || "model"
}

function logDur(ms: number): string {
  return formatDuration(ms) || "0ms"
}

function logStatus(err: string | null | undefined): string {
  const raw = (err || "").trim()
  if (!raw) return "ok"
  return raw.toLowerCase().includes("abort") ? "abort" : "error"
}

/** Aligned columns for a Perf log. Last cell is not padded. */
export function formatColumns(headers: string[], rows: string[][]): string {
  if (headers.length === 0) return ""
  const widths = headers.map((h, i) => {
    let w = h.length
    for (const row of rows) {
      const cell = row[i] ?? ""
      if (cell.length > w) w = cell.length
    }
    return w
  })
  const line = (cells: string[]) =>
    cells.map((c, i) => (i >= widths.length - 1 ? c : (c ?? "").padEnd(widths[i]!))).join("  ")
  return [line(headers), ...rows.map((r) => line(headers.map((_, i) => r[i] ?? "")))].join("\n")
}

export type PerfLogRow = {
  at: number | null
  end?: number | null
  phase: string
  /** Bare tool id (`bash`, `read`). Empty on wait/think/recv. */
  tool?: string
  /** Exact call hint (`db.ts`, `bun test …`) or the model name. */
  name: string
  status: string
  ms: number
  extra?: string
}

function hintStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/** Bare tool + the specific call (file / command / pattern). Never I/O. */
export function toolLogCall(part: PartRow): { tool: string; call: string } {
  const tool = hintStr(part.tool) || "tool"
  const label = shortToolLabel({
    tool,
    title: part.title,
    command: part.command,
    filePath: part.filePath,
    pattern: part.pattern,
    description: part.description,
    subagent: part.subagent,
    maxHint: 48,
  })
  const prefix = `${tool} `
  const call = label.startsWith(prefix) ? label.slice(prefix.length) : label === tool ? "—" : label
  return { tool, call }
}

export function perfLogKindLabel(kind: PerfLogKind): string {
  return kind === PERF_PHASE_TOOL ? "tools" : kind
}

export function perfLogFileName(kind: PerfLogKind, generatedAt: number, toolFilter?: string): string {
  const stamp = formatWhen(generatedAt).replace(/[: ]/g, "-")
  const ms = String(generatedAt % 1000).padStart(3, "0")
  const toolPart = toolFilter ? `-${toolFilter.replace(/[^a-z0-9_-]/gi, "_")}` : ""
  return `perf-${perfLogKindLabel(kind)}${toolPart}-${stamp}-${ms}.log`
}

/** One dated event per turn / tool / idle gap. Exported for tests. */
export function collectPerfLogRows(
  kind: PerfLogKind,
  msgs: MsgRow[],
  parts: PartRow[],
): PerfLogRow[] {
  const { byMsg } = collectParts(parts)
  const rows: PerfLogRow[] = []
  const assistant: Array<{
    start: number | null
    end: number | null
    model: string
    status: string
    waitMs: number
    thinkMs: number
    recvMs: number
    toolMs: number
    tin: number
    tout: number
  }> = []

  for (const row of msgs) {
    if ((row.role || "") !== "assistant") continue
    const start = toEpochMs(row.created)
    const end = toEpochMs(row.completed)
    const b = byMsg.get(String(row.id)) ?? newBucket()
    const model = modelLabel(row.provider, row.model)
    const status = logStatus(row.err)
    const waitMs = span(start, b.firstOut)
    const recvMs = span(b.textStart, b.textEnd)
    assistant.push({
      start,
      end,
      model,
      status,
      waitMs,
      thinkMs: b.thinkMs,
      recvMs,
      toolMs: b.toolMs,
      tin: num(row.tin),
      tout: num(row.tout),
    })
    if (kind === PERF_PHASE_WAIT || kind === PERF_LOG_KIND_TIME) {
      rows.push({ at: start, end, phase: PERF_PHASE_WAIT, name: model, status, ms: waitMs })
    }
    if ((kind === PERF_PHASE_THINK || kind === PERF_LOG_KIND_TIME) && b.thinkMs > 0) {
      rows.push({ at: start, end, phase: PERF_PHASE_THINK, name: model, status, ms: b.thinkMs })
    }
    if (kind === PERF_PHASE_RECV || kind === PERF_LOG_KIND_TIME) {
      rows.push({ at: start, end, phase: PERF_PHASE_RECV, name: model, status, ms: recvMs })
    }
    if (kind === PERF_LOG_KIND_MODELS) {
      rows.push({
        at: start,
        end,
        phase: "turn",
        name: model,
        status,
        ms: span(start, end),
        extra: [logDur(waitMs), logDur(b.thinkMs), logDur(recvMs), logDur(b.toolMs), String(num(row.tin)), String(num(row.tout))].join("\t"),
      })
    }
  }

  if (kind === PERF_PHASE_TOOL || kind === PERF_LOG_KIND_TIME) {
    for (const part of parts) {
      if ((part.kind || "") !== PERF_PHASE_TOOL) continue
      if (!countsAsTool(part.tool)) continue
      const start = toEpochMs(part.tstart)
      const end = toEpochMs(part.tend)
      const ms = span(start, end)
      const failed = (part.status || "").toLowerCase() === "error"
      const { tool, call } = toolLogCall(part)
      rows.push({
        at: start,
        end,
        phase: PERF_PHASE_TOOL,
        tool,
        name: call,
        status: failed ? "error" : hintStr(part.status) || "ok",
        ms,
      })
    }
  }

  if (kind === PERF_PHASE_IDLE || kind === PERF_LOG_KIND_TIME) {
    const ordered = [...assistant].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const cur = ordered[i]
      const next = ordered[i + 1]
      if (!cur || !next) continue
      const from = cur.end ?? cur.start
      const gap = span(from, next.start)
      if (gap > 0) {
        rows.push({ at: from, end: next.start, phase: PERF_PHASE_IDLE, name: "gap", status: "ok", ms: gap })
      }
    }
  }

  rows.sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || a.phase.localeCompare(b.phase))
  return rows
}

export type PerfLogDoc = {
  title: string
  fileName: string
  text: string
  written: string | null
}

function toolSummary(rows: PerfLogRow[]): { headers: string[]; rows: string[][] } {
  const by = new Map<string, { tool: string; call: string; count: number; errors: number; totalMs: number }>()
  for (const row of rows) {
    if (row.phase !== PERF_PHASE_TOOL) continue
    const tool = row.tool || row.name
    const call = row.tool ? row.name : "—"
    const key = `${tool}\t${call}`
    const agg = by.get(key) ?? { tool, call, count: 0, errors: 0, totalMs: 0 }
    agg.count += 1
    agg.totalMs += row.ms
    if (row.status === "error") agg.errors += 1
    by.set(key, agg)
  }
  const list = [...by.values()]
    .map((a) => ({ ...a, avgMs: a.count > 0 ? Math.round(a.totalMs / a.count) : 0 }))
    .sort((a, b) => b.totalMs - a.totalMs || b.count - a.count)
  return {
    headers: ["tool", "call", "count", "errors", "total", "avg"],
    rows: list.map((t) => [t.tool, t.call, String(t.count), String(t.errors), logDur(t.totalMs), logDur(t.avgMs)]),
  }
}

/** Build the dated column log. `now` is the generation stamp. */
export function formatPerfLog(
  kind: PerfLogKind,
  sessionId: string,
  now: number,
  rows: PerfLogRow[],
  titleOverride?: string,
): string {
  const title = titleOverride ?? perfLogKindLabel(kind)
  const head = [
    `# Perf ${title} log`,
    `# generated ${formatWhen(now)}`,
    `# session ${sessionId}`,
    `# rows ${rows.length}`,
    "",
  ]
  const parts = [...head]
  if (kind === PERF_PHASE_TOOL || kind === PERF_LOG_KIND_TIME) {
    const sum = toolSummary(rows)
    if (sum.rows.length > 0) {
      parts.push(formatColumns(sum.headers, sum.rows), "")
    }
  }
  if (rows.length === 0) {
    parts.push("(no rows)")
    return `${parts.join("\n")}\n`
  }
  if (kind === PERF_LOG_KIND_MODELS) {
    const headers = ["when", "model", "wait", "think", "recv", "tools", "in", "out", "status"]
    const body = rows.map((r) => {
      const extra = (r.extra ?? "").split("\t")
      return [
        formatWhen(r.at),
        r.name,
        extra[0] || "—",
        extra[1] || "—",
        extra[2] || "—",
        extra[3] || "—",
        extra[4] || "0",
        extra[5] || "0",
        r.status,
      ]
    })
    parts.push(formatColumns(headers, body))
  } else if (kind === PERF_PHASE_TOOL) {
    parts.push(
      formatColumns(
        ["when", "ended", "tool", "call", "status", "duration"],
        rows.map((r) => [
          formatWhen(r.at),
          formatWhen(r.end),
          r.tool || r.name,
          r.tool ? r.name : "—",
          r.status,
          logDur(r.ms),
        ]),
      ),
    )
  } else if (kind === PERF_LOG_KIND_TIME) {
    parts.push(
      formatColumns(
        ["when", "ended", "phase", "tool", "call", "status", "duration"],
        rows.map((r) => [
          formatWhen(r.at),
          formatWhen(r.end),
          r.phase,
          r.tool || "—",
          r.name,
          r.status,
          logDur(r.ms),
        ]),
      ),
    )
  } else {
    parts.push(
      formatColumns(
        ["when", "ended", "name", "status", "duration"],
        rows.map((r) => [formatWhen(r.at), formatWhen(r.end), r.name, r.status, logDur(r.ms)]),
      ),
    )
  }
  return `${parts.join("\n")}\n`
}

export function writePerfLog(text: string, fileName: string, dir?: string): string | null {
  try {
    const root = dir ?? path.join(os.tmpdir(), "oes-perf")
    fs.mkdirSync(root, { recursive: true })
    const abs = path.join(root, fileName)
    fs.writeFileSync(abs, text, "utf8")
    return abs
  } catch {
    return null
  }
}

export function readPerfLog(opts: {
  dbPath: string
  sessionId: string
  turns: number
  kind: PerfLogKind
  now: number
  logDir?: string
  /** When set, filter tool-phase rows to this bare tool name (e.g. "bash"). */
  toolFilter?: string
}): PerfLogDoc | null {
  if (!opts.dbPath || !fs.existsSync(opts.dbPath)) return null
  const load = (): PerfLogDoc | null => {
    const db = openReadonlyDb(opts.dbPath)
    if (!db) return null
    const { msgs, parts } = readRows(db, opts.sessionId, opts.turns, true)
    const allRows = collectPerfLogRows(opts.kind, msgs, parts)
    const rows = opts.toolFilter
      ? allRows.filter((r) => r.tool === opts.toolFilter)
      : allRows
    const kindLabel = opts.toolFilter
      ? `${perfLogKindLabel(opts.kind)} · ${opts.toolFilter}`
      : perfLogKindLabel(opts.kind)
    const text = formatPerfLog(opts.kind, opts.sessionId, opts.now, rows, kindLabel)
    const fileName = perfLogFileName(opts.kind, opts.now, opts.toolFilter)
    const written = writePerfLog(text, fileName, opts.logDir)
    return { title: `${kindLabel} log`, fileName, text, written }
  }
  return withDbRead(load, () => null)
}

function collectParts(rows: PartRow[]): {
  byMsg: Map<string, Bucket>
  tools: Map<string, ToolPerf>
} {
  const byMsg = new Map<string, Bucket>()
  const tools = new Map<string, ToolPerf>()
  for (const row of rows) {
    const kind = row.kind || ""
    if (kind !== PART_TYPE_TEXT && kind !== PART_TYPE_REASONING && kind !== PART_TYPE_TOOL) continue
    const mid = String(row.mid || "")
    if (!mid) continue
    const b = byMsg.get(mid) ?? newBucket()

    if (kind === PART_TYPE_TEXT || kind === PART_TYPE_REASONING) {
      const start = toEpochMs(row.pstart)
      const end = toEpochMs(row.pend)
      if (start != null && (b.firstOut == null || start < b.firstOut)) b.firstOut = start
      if (kind === PART_TYPE_REASONING) {
        b.thinkMs += span(start, end)
      } else {
        if (start != null && (b.textStart == null || start < b.textStart)) b.textStart = start
        if (end != null && (b.textEnd == null || end > b.textEnd)) b.textEnd = end
      }
      byMsg.set(mid, b)
      continue
    }

    if (!countsAsTool(row.tool)) continue
    const start = toEpochMs(row.tstart)
    const end = toEpochMs(row.tend)
    const ms = span(start, end)
    const failed = (row.status || "").toLowerCase() === "error"
    b.tools += 1
    b.toolMs += ms
    if (failed) b.toolErrors += 1
    byMsg.set(mid, b)

    const name = (row.tool || "tool").trim() || "tool"
    const agg = tools.get(name) ?? { name, count: 0, errors: 0, totalMs: 0, avgMs: 0 }
    agg.count += 1
    agg.totalMs += ms
    if (failed) agg.errors += 1
    tools.set(name, agg)
  }
  return { byMsg, tools }
}

type LogPartSql = PartRow & {
  command2?: string | null
  filePath2?: string | null
  pattern2?: string | null
  description2?: string | null
  category?: string | null
}

function foldLogPart(row: LogPartSql): PartRow {
  return {
    mid: row.mid,
    kind: row.kind,
    pstart: row.pstart,
    pend: row.pend,
    tool: row.tool,
    status: row.status,
    tstart: row.tstart,
    tend: row.tend,
    title: hintStr(row.title),
    command: hintStr(row.command) || hintStr(row.command2),
    filePath: hintStr(row.filePath) || hintStr(row.filePath2),
    pattern: hintStr(row.pattern) || hintStr(row.pattern2),
    description: hintStr(row.description) || hintStr(row.description2),
    subagent: hintStr(row.subagent) || hintStr(row.category),
  }
}

function readRows(
  db: SqlDb,
  sessionId: string,
  turns: number,
  detailed = false,
): { msgs: MsgRow[]; parts: PartRow[] } {
  const partLimit = Math.min(6000, Math.max(200, turns * 12))
  const msgs = db.all<MsgRow>(MSG_SQL, sessionId, turns)
  const parts = detailed
    ? db.all<LogPartSql>(LOG_PART_SQL, sessionId, partLimit).map(foldLogPart)
    : db.all<PartRow>(PART_SQL, sessionId, partLimit)
  return { msgs, parts }
}

/** Fold message + part rows into the Perf snapshot. Exported for tests. */
export function aggregate(sessionId: string, msgs: MsgRow[], parts: PartRow[]): PerfSnapshot {
  const snap = emptyPerf(sessionId)
  snap.present = true
  const { byMsg, tools } = collectParts(parts)

  const models = new Map<string, ModelPerf>()
  const waitCount = new Map<string, number>()
  const thinkCount = new Map<string, number>()
  const recvCount = new Map<string, number>()
  const turnCount = new Map<string, number>()
  const sums = new Map<string, { wait: number; think: number; recv: number; turn: number }>()
  const trend: TrendPoint[] = []

  let firstStart = 0
  let lastEnd = 0

  for (const row of msgs) {
    if ((row.role || "") !== "assistant") continue
    const start = toEpochMs(row.created)
    const end = toEpochMs(row.completed)
    const b = byMsg.get(String(row.id)) ?? newBucket()

    const waitMs = span(start, b.firstOut)
    const recvMs = span(b.textStart, b.textEnd)
    const turnMs = span(start, end)
    const out = num(row.tout)

    snap.totals.turns += 1
    if (row.err) {
      if (String(row.err).toLowerCase().includes("abort")) snap.totals.aborts += 1
      else snap.totals.errors += 1
    }
    snap.totals.phases.wait += waitMs
    snap.totals.phases.think += b.thinkMs
    snap.totals.phases.recv += recvMs
    snap.totals.phases.tool += b.toolMs
    snap.totals.activeMs += turnMs
    snap.totals.tokensIn += num(row.tin)
    snap.totals.tokensOut += out
    snap.totals.tokensReasoning += num(row.treason)
    snap.totals.cacheRead += num(row.cread)
    snap.totals.cacheWrite += num(row.cwrite)
    snap.totals.cost += typeof row.cost === "number" && row.cost > 0 ? row.cost : 0
    if (start != null && (firstStart === 0 || start < firstStart)) firstStart = start
    const tail = end ?? b.textEnd ?? start
    if (tail != null && tail > lastEnd) lastEnd = tail

    const key = `${row.provider || "?"}/${row.model || "?"}`
    const m = models.get(key) ?? {
      key,
      model: modelLabel(row.provider, row.model),
      provider: (row.provider || "").trim(),
      turns: 0,
      waitMs: null,
      thinkMs: null,
      recvMs: null,
      turnMs: null,
      tokensPerSec: null,
      toolMs: 0,
      tools: 0,
      errors: 0,
      tokensIn: 0,
      tokensOut: 0,
      tokensReasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      lastAt: 0,
    }
    m.turns += 1
    m.toolMs += b.toolMs
    m.tools += b.tools
    m.errors += b.toolErrors + (row.err ? 1 : 0)
    m.tokensIn += num(row.tin)
    m.tokensOut += out
    m.tokensReasoning += num(row.treason)
    m.cacheRead += num(row.cread)
    m.cacheWrite += num(row.cwrite)
    m.cost += typeof row.cost === "number" && row.cost > 0 ? row.cost : 0
    if (start != null && start > m.lastAt) m.lastAt = start
    models.set(key, m)

    const s = sums.get(key) ?? { wait: 0, think: 0, recv: 0, turn: 0 }
    if (waitMs > 0) {
      s.wait += waitMs
      waitCount.set(key, (waitCount.get(key) ?? 0) + 1)
    }
    if (b.thinkMs > 0) {
      s.think += b.thinkMs
      thinkCount.set(key, (thinkCount.get(key) ?? 0) + 1)
    }
    if (recvMs > 0) {
      s.recv += recvMs
      recvCount.set(key, (recvCount.get(key) ?? 0) + 1)
    }
    if (turnMs > 0) {
      s.turn += turnMs
      turnCount.set(key, (turnCount.get(key) ?? 0) + 1)
    }
    sums.set(key, s)

    trend.push({
      at: start ?? 0,
      waitMs: waitMs > 0 ? waitMs : null,
      tokensPerSec: recvMs > 0 && out > 0 ? (out / recvMs) * 1000 : null,
    })
  }

  for (const [key, m] of models) {
    const s = sums.get(key) ?? { wait: 0, think: 0, recv: 0, turn: 0 }
    m.waitMs = avg(s.wait, waitCount.get(key) ?? 0)
    m.thinkMs = avg(s.think, thinkCount.get(key) ?? 0)
    m.recvMs = avg(s.recv, recvCount.get(key) ?? 0)
    m.turnMs = avg(s.turn, turnCount.get(key) ?? 0)
    m.tokensPerSec = s.recv > 0 ? (m.tokensOut / s.recv) * 1000 : null
  }

  // Tool calls can straddle turn boundaries, so phases are measured against the
  // whole window rather than the summed turn durations.
  const p = snap.totals.phases
  snap.totals.wallMs = span(firstStart, lastEnd)
  p.idle = Math.max(0, snap.totals.wallMs - (p.wait + p.think + p.recv + p.tool))
  const sent = snap.totals.tokensIn + snap.totals.cacheRead
  snap.totals.cacheHit = sent > 0 ? snap.totals.cacheRead / sent : null

  snap.models = [...models.values()].sort((a, b) => b.turns - a.turns || b.lastAt - a.lastAt)
  snap.tools = [...tools.values()]
    .map((t) => ({ ...t, avgMs: t.count > 0 ? Math.round(t.totalMs / t.count) : 0 }))
    .sort((a, b) => b.totalMs - a.totalMs || b.count - a.count)
  snap.trend = trend.reverse()
  return snap
}

/** Compact per-session row for the History section. */
function sessionPerf(db: SqlDb, id: string, title: string, turns: number): SessionPerf | null {
  const { msgs, parts } = readRows(db, id, turns)
  const agg = aggregate(id, msgs, parts)
  if (agg.totals.turns === 0) return null
  const top = agg.models[0]
  const active = agg.totals.activeMs
  return {
    id,
    title,
    model: top?.model ?? "",
    turns: agg.totals.turns,
    waitMs: top?.waitMs ?? null,
    tokensPerSec: top?.tokensPerSec ?? null,
    toolShare: active > 0 ? agg.totals.phases.tool / active : null,
  }
}

export type PerfOptions = {
  dbPath: string
  sessionId: string
  /** How many recent messages to scan. */
  turns: number
  /** Recent sessions for the History section, current one excluded by the caller. */
  history?: Array<{ id: string; title: string }>
  historyTurns?: number
  /** Snapshot fingerprint — identical input returns the cached result. */
  cacheKey?: string
}

const perfCache = createStampCache<PerfSnapshot>()
let histKey = ""
let histAt = 0
let histCached: SessionPerf[] = []
const HIST_TTL_MS = 10_000

export function resetPerfCache(): void {
  perfCache.reset()
  histKey = ""
  histAt = 0
  histCached = []
}

export function readPerfSnapshot(opts: PerfOptions): PerfSnapshot {
  const key = opts.cacheKey
    ? `${opts.cacheKey}::${opts.turns}::${(opts.history ?? []).map((h) => h.id).join(",")}`
    : ""

  const load = (): PerfSnapshot => {
    if (!opts.dbPath || !fs.existsSync(opts.dbPath)) {
      dbg("perf", "db missing", { dbPath: opts.dbPath, sessionId: opts.sessionId })
      return emptyPerf(opts.sessionId, "db missing")
    }
    const db = openReadonlyDb(opts.dbPath)
    if (!db) {
      dbg("perf", "sqlite unavailable", { dbPath: opts.dbPath })
      return emptyPerf(opts.sessionId, "sqlite unavailable")
    }
    const { msgs, parts } = readRows(db, opts.sessionId, opts.turns)
    dbg("perf", "loaded", { dbPath: opts.dbPath, sessionId: opts.sessionId, msgs: msgs.length, parts: parts.length })
    const snap = aggregate(opts.sessionId, msgs, parts)
    const hKey = (opts.history ?? []).map((h) => h.id).join(",")
    const now = Date.now()
    if (hKey === histKey && now - histAt < HIST_TTL_MS) {
      snap.history = histCached
      return snap
    }
    const histTurns = Math.max(20, Math.min(opts.historyTurns ?? 60, opts.turns))
    for (const h of opts.history ?? []) {
      if (h.id === opts.sessionId) continue
      try {
        const row = sessionPerf(db, h.id, h.title, histTurns)
        if (row) snap.history.push(row)
      } catch {
        // one unreadable session must not sink the tab
      }
    }
    histKey = hKey
    histAt = now
    histCached = snap.history
    return snap
  }

  const run = () =>
    profile("perf.read", () =>
      withDbRead(load, (e) =>
        emptyPerf(opts.sessionId, e instanceof Error ? e.message : "perf read failed"),
      ),
    )
  if (!key) return run()
  return perfCache.get(key, run)
}
