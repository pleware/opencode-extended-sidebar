/** Pulse + lifecycle mark for agent rows. Evaluated against wall clock. */
import { eventType } from "./pware.oc.core.events.js"
import { basenameOf } from "./pware.oc.core.paths.js"
import { normalizeStatus, toToolStatus } from "./pware.oc.core.status.js"
import {
  EVENT_MESSAGE_PART_UPDATED,
  EVENT_PART_DELTA,
  EVENT_REASONING_DELTA,
  EVENT_REASONING_STARTED,
  EVENT_SESSION_IDLE,
  EVENT_SESSION_STATUS,
  EVENT_STEP_ENDED,
  EVENT_STEP_FAILED,
  EVENT_STEP_STARTED,
  EVENT_TEXT_DELTA,
  EVENT_TEXT_STARTED,
  EVENT_TOOL_CALLED,
  EVENT_TOOL_ENDED,
  EVENT_TOOL_FAILED,
  EVENT_TOOL_SUCCESS,
} from "./constants/pware.oc.core.constants.eventType.js"
import { TOOL_BASH, TOOL_TASK } from "./constants/pware.oc.core.constants.toolName.js"
import {
  FLOW_HINT_CLEAR,
  FLOW_RECV,
  FLOW_TOOL,
  FLOW_WAIT,
  MARK_QUEUED,
  MARK_READY,
  PULSE_IDLE,
  PULSE_LIVE,
  PULSE_STALE,
  type AgentMark,
  type FlowDir,
  type FlowHint,
  type Pulse,
} from "./constants/pware.oc.core.constants.pulse.js"
import {
  STATUS_ARCHIVED,
  STATUS_COMPLETED,
  STATUS_ERROR,
  STATUS_RUNNING,
  TOOL_STATUS_COMPLETED,
  TOOL_STATUS_ERROR,
  TOOL_STATUS_RUNNING,
  type ToolStatus,
} from "./constants/pware.oc.core.constants.status.js"

export type { AgentMark, FlowDir, FlowHint, Pulse }

/** `at` is the last event of this direction, `since` the moment the phase began. */
export type FlowEntry = { dir: FlowDir; at: number; since: number }

export const LIVE_MS = 5_000
export const STALE_MS = 10_000
/** Downstream tokens still count as recv. */
export const FLOW_RECV_MS = 2_000
/** Keep ↑ after step.started while the runner is still busy. */
export const FLOW_WAIT_MS = 15_000
/** Tool call stays → until success/fail or timeout. */
export const FLOW_TOOL_MS = 30_000
export function pulseFromAge(ageMs: number): Pulse {
  if (ageMs < LIVE_MS) return PULSE_LIVE
  if (ageMs < STALE_MS) return PULSE_STALE
  return PULSE_IDLE
}

/** Epoch ms. OpenCode may store seconds, ms, or ISO strings. */
export function toEpochMs(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    return v < 1e11 ? v * 1000 : v
  }
  if (typeof v === "string" && v.trim()) {
    const n = Date.parse(v)
    return Number.isNaN(n) ? null : n
  }
  return null
}

/** OpenCode may store seconds or ms. */
export function stampMs(v: number | null | undefined): number | null {
  return toEpochMs(v)
}

/** Last activity: SQLite time_updated, TUI event, or boulder stamp. */
export function pulseAgeMs(
  now: number,
  ...stamps: Array<number | null | undefined>
): number | null {
  let last = 0
  for (const s of stamps) {
    const ms = stampMs(s)
    if (ms != null && ms > last) last = ms
  }
  if (!last) return null
  return Math.max(0, now - last)
}

export function composeMark(opts: {
  lifecycle?: string | null
  archived?: boolean
  ageMs: number | null
  busy?: boolean
}): AgentMark {
  if (opts.archived) return STATUS_ARCHIVED
  const c = normalizeStatus(opts.lifecycle)
  if (c === STATUS_COMPLETED) return MARK_READY
  if (c === STATUS_ERROR) return STATUS_ERROR
  if (opts.busy) return opts.ageMs == null ? PULSE_LIVE : pulseFromAge(Math.min(opts.ageMs, LIVE_MS - 1))
  if (opts.ageMs == null) {
    if (c === STATUS_RUNNING) return PULSE_STALE
    return MARK_QUEUED
  }
  // Running is not terminal — same age window as Agents. A leftover
  // boulder `running` must not keep the spinner after the session went quiet.
  return pulseFromAge(opts.ageMs)
}

/** Group header pulse: live > stale > error > idle `•`. */
export function hottestMark(marks: readonly AgentMark[]): AgentMark {
  let stale = false
  let error = false
  for (const m of marks) {
    if (m === PULSE_LIVE) return PULSE_LIVE
    if (m === PULSE_STALE) stale = true
    else if (m === STATUS_ERROR) error = true
  }
  if (stale) return PULSE_STALE
  return error ? STATUS_ERROR : MARK_READY
}

export function activeFlow(
  entry: FlowEntry | undefined,
  now: number,
  busy: boolean,
): FlowDir | null {
  if (entry) {
    const age = now - entry.at
    if (entry.dir === FLOW_RECV && age < FLOW_RECV_MS) return FLOW_RECV
    if (entry.dir === FLOW_WAIT && (busy || age < FLOW_WAIT_MS)) return FLOW_WAIT
    if (entry.dir === FLOW_TOOL && (busy || age < FLOW_TOOL_MS)) return FLOW_TOOL
  }
  if (busy) return FLOW_WAIT
  return null
}

export function applyFlow(
  prev: Record<string, FlowEntry>,
  id: string,
  dir: FlowHint,
  now: number,
): Record<string, FlowEntry> {
  if (dir === FLOW_HINT_CLEAR) {
    if (!(id in prev)) return prev
    const next = { ...prev }
    delete next[id]
    return next
  }
  const cur = prev[id]
  if (dir === FLOW_WAIT) {
    if (cur?.dir === FLOW_RECV && now - cur.at < FLOW_RECV_MS) return prev
    if (cur?.dir === FLOW_TOOL) return prev
  }
  const since = cur?.dir === dir ? cur.since : now
  return { ...prev, [id]: { dir, at: now, since } }
}

/** How long the current phase has been running. Null when the row is quiet. */
export function phaseAgeMs(
  entry: FlowEntry | undefined,
  now: number,
  dir: FlowDir | null,
): number | null {
  if (!entry || !dir || entry.dir !== dir) return null
  return Math.max(0, now - entry.since)
}

function partKind(evt: unknown): string {
  if (!evt || typeof evt !== "object") return ""
  const o = evt as Record<string, unknown>
  const props =
    o.properties && typeof o.properties === "object"
      ? (o.properties as Record<string, unknown>)
      : o
  const part = props.part
  if (part && typeof part === "object") {
    return String((part as Record<string, unknown>).type ?? "").toLowerCase()
  }
  return ""
}

/** Classify host event as wait / recv / tool. Never reads request or response bodies. */
export function flowFromEvent(
  evt: unknown,
  fallbackType = "",
): { id: string | null; dir: FlowHint | null } {
  const type = eventType(evt) || fallbackType.toLowerCase()
  const id = sessionIdFromEvent(evt)
  if (!type) return { id, dir: null }

  if (
    type.includes(EVENT_SESSION_IDLE) ||
    type.endsWith("." + EVENT_STEP_ENDED) ||
    type.endsWith("." + EVENT_STEP_FAILED)
  ) {
    return { id, dir: FLOW_HINT_CLEAR }
  }

  if (type.includes(EVENT_TOOL_CALLED)) return { id, dir: FLOW_TOOL }
  if (
    type.includes(EVENT_TOOL_SUCCESS) ||
    type.includes(EVENT_TOOL_FAILED) ||
    type.includes(EVENT_TOOL_ENDED)
  ) {
    return { id, dir: FLOW_WAIT }
  }

  if (
    type.includes(EVENT_TEXT_DELTA) ||
    type.includes(EVENT_REASONING_DELTA) ||
    type.includes(EVENT_PART_DELTA) ||
    type.endsWith(".delta")
  ) {
    return { id, dir: FLOW_RECV }
  }

  if (
    type.includes(EVENT_STEP_STARTED) ||
    type.includes(EVENT_TEXT_STARTED) ||
    type.includes(EVENT_REASONING_STARTED)
  ) {
    return { id, dir: FLOW_WAIT }
  }

  if (type.includes(EVENT_MESSAGE_PART_UPDATED)) {
    const kind = partKind(evt)
    if (kind.includes("tool")) return { id, dir: FLOW_TOOL }
    return { id, dir: FLOW_RECV }
  }

  if (type === EVENT_SESSION_STATUS || type.endsWith(EVENT_SESSION_STATUS)) {
    const flag = sessionBusyFromEvent(evt)
    if (flag.busy === false) return { id: flag.id ?? id, dir: FLOW_HINT_CLEAR }
    if (flag.busy === true) return { id: flag.id ?? id, dir: FLOW_WAIT }
  }

  return { id, dir: null }
}

export function sessionBusyFromEvent(evt: unknown): { id: string | null; busy: boolean | null } {
  if (!evt || typeof evt !== "object") return { id: null, busy: null }
  const o = evt as Record<string, unknown>
  const props =
    o.properties && typeof o.properties === "object"
      ? (o.properties as Record<string, unknown>)
      : o
  const id = sessionIdFromEvent(evt)
  const kind = String(o.type ?? "").toLowerCase()
  if (kind === EVENT_SESSION_IDLE || kind.endsWith(EVENT_SESSION_IDLE)) {
    return { id, busy: false }
  }
  const status = props.status
  if (status && typeof status === "object") {
    const t = String((status as Record<string, unknown>).type || "").toLowerCase()
    if (t === "busy" || t === "retry") return { id, busy: true }
    if (t === "idle") return { id, busy: false }
  }
  const raw = String(status ?? o.status ?? "").toLowerCase()
  if (raw === "busy" || raw === "running") return { id, busy: true }
  if (raw === "idle") return { id, busy: false }
  return { id, busy: null }
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  const v = Math.max(0, n)
  if (v >= 1e6) return `${v >= 10e6 ? Math.round(v / 1e6) : (v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${v >= 10_000 ? Math.round(v / 1e3) : (v / 1e3).toFixed(1)}k`
  return String(Math.round(v))
}

/** Models header: ↑in ↓out ∴reasoning. Reasoning omitted when zero. */
export function tokenSummary(tokens: {
  tokensIn: number
  tokensOut: number
  tokensReasoning?: number
}): string {
  const parts = [`↑${formatTokens(tokens.tokensIn)}`, `↓${formatTokens(tokens.tokensOut)}`]
  if ((tokens.tokensReasoning ?? 0) > 0) parts.push(`∴${formatTokens(tokens.tokensReasoning)}`)
  return parts.join(" ")
}

/** Time header: turns · duration · optional err/abort. The caller decides what span to show. */
export function timeSummary(totals: {
  turns: number
  durationMs: number
  errors?: number
  aborts?: number
}): string {
  const parts = [`${totals.turns} turns`, formatSpan(totals.durationMs)]
  if ((totals.errors ?? 0) > 0) parts.push(`${totals.errors} err`)
  if ((totals.aborts ?? 0) > 0) parts.push(`${totals.aborts} abort`)
  return parts.join(" · ")
}

/** s / m / h / d buckets shared by age, duration, and span formatters. */
function formatCoarseSec(totalSec: number, compositeHours = false): string {
  const s = Math.max(0, Math.floor(totalSec))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) {
    const rem = m % 60
    return compositeHours && rem > 0 ? `${h}h${rem}m` : `${h}h`
  }
  return `${Math.floor(h / 24)}d`
}

export function formatAge(ageMs: number | null | undefined): string {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return ""
  return formatCoarseSec(ageMs / 1000)
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 1) return ""
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  return formatCoarseSec(Math.round(ms / 1000))
}

/** UTC `YYYY-MM-DD HH:MM:SS` for logs and detail sheets. */
export function formatWhen(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return "—"
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toISOString().replace("T", " ").slice(0, 19)
}

/** Coarser than formatDuration — minutes and hours for whole-session sums. */
export function formatSpan(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 1000) return "0s"
  return formatCoarseSec(Math.round(ms / 1000), true)
}

export function formatRate(perSec: number | null | undefined): string {
  if (perSec == null || !Number.isFinite(perSec) || perSec <= 0) return ""
  return perSec >= 100 ? `${Math.round(perSec)}/s` : `${perSec.toFixed(1)}/s`
}

/** Token rate for the status bar: integer-rounded and always present — "0 tok/s" when idle. */
export function formatTokenRate(perSec: number | null | undefined): string {
  const n = perSec == null || !Number.isFinite(perSec) || perSec < 0 ? 0 : perSec
  return `${Math.round(n)} tok/s`
}

/**
 * The streaming chunk of a text/reasoning delta event. Only the explicit
 * `delta` field (message.part.updated / message.part.delta) or, on a delta-type
 * event, a bare `text` (session.next.text.delta / reasoning.delta). Never reads
 * a full message or part body — the count, not the content, is what matters.
 */
export function deltaTextFromEvent(evt: unknown): string | null {
  if (!evt || typeof evt !== "object") return null
  const type = eventType(evt)
  const bags = eventBags(evt)
  for (const bag of bags) {
    const d = bag.delta
    if (typeof d === "string" && d.trim()) return d
  }
  if (!type.includes(".delta")) return null
  for (const bag of bags) {
    const t = bag.text
    if (typeof t === "string" && t.trim()) return t
  }
  return null
}

/** Rough token count from a text chunk: code points / charsPerToken (≈4). */
export function estimateTokens(text: string, charsPerToken = 4): number {
  const t = (text || "").replace(/\s+/g, " ").trim()
  if (!t) return 0
  return Math.max(1, Math.ceil([...t].length / charsPerToken))
}

/** Whether a streamed text delta is visible output (`out`) or hidden thinking (`reasoning`). */
export function deltaKindFromEvent(evt: unknown): "out" | "reasoning" {
  const type = eventType(evt)
  const kind = partKind(evt)
  if (type.includes("reasoning") || kind.includes("reasoning")) return "reasoning"
  return "out"
}

/** A single streaming token-count sample: `n` estimated tokens at `at`. */
export type TokenTick = { at: number; n: number }

/** Append a tick and drop samples older than the sliding window (immutable). */
export function pushTokenTick(
  ticks: readonly TokenTick[],
  at: number,
  n: number,
  windowMs: number,
): TokenTick[] {
  if (!Number.isFinite(n) || n <= 0) return [...ticks]
  const next = [...ticks, { at, n }]
  return next.filter((t) => at - t.at <= windowMs)
}

/** Live rate over the window: tokens per second, or null when the span is too short. */
export function tokenRate(
  ticks: readonly TokenTick[],
  at: number,
  windowMs: number,
): number | null {
  const win = ticks.filter((t) => at - t.at <= windowMs)
  if (win.length < 2) return null
  const sum = win.reduce((s, t) => s + t.n, 0)
  const spanMs = at - win[0]!.at
  if (spanMs <= 0) return null
  return (sum / spanMs) * 1000
}

export function formatPercent(share: number | null | undefined): string {
  if (share == null || !Number.isFinite(share) || share < 0) return ""
  const pct = share * 100
  if (pct > 0 && pct < 1) return "<1%"
  return `${Math.round(pct)}%`
}

/** A metric chip on a row. Higher `rank` is dropped first when the line is tight. */
export type Chip = { text: string; rank: number }

/** Keep as many chips as `max` allows, worst rank first, name budget reserved. */
export function packChips(nameWidth: number, chips: Chip[], max: number): Chip[] {
  const keep = chips.filter((c) => c.text)
  const width = () => keep.reduce((sum, c) => sum + c.text.length + 1, nameWidth)
  while (keep.length > 0 && width() > max) {
    let worst = 0
    for (let i = 1; i < keep.length; i += 1) {
      if ((keep[i]?.rank ?? 0) > (keep[worst]?.rank ?? 0)) worst = i
    }
    keep.splice(worst, 1)
  }
  return keep
}

/** Name and chips each take the full line — they do not compete for one row. */
export function packStackedRow(
  name: string,
  chips: Chip[],
  lineMax: number,
): { name: string; chips: Chip[] } {
  const room = Math.max(4, lineMax - 2)
  return { name: shortMiddle(name, room), chips: packChips(0, chips, room) }
}

/** Middle ellipsis — `deepseek-v4-pro` keeps both the family and the tier. */
export function shortMiddle(name: string, max: number): string {
  const t = name.replace(/\s+/g, " ").trim()
  if (max <= 0) return ""
  if (t.length <= max) return t
  if (max <= 2) return t.slice(0, max)
  const tail = Math.max(3, Math.floor((max - 1) / 2))
  const head = max - 1 - tail
  return `${t.slice(0, head)}…${t.slice(t.length - tail)}`
}

export function toolMark(status: string): AgentMark {
  const c = normalizeStatus(status)
  if (c === STATUS_RUNNING) return PULSE_LIVE
  if (c === STATUS_ERROR) return STATUS_ERROR
  if (c === STATUS_COMPLETED) return MARK_READY
  return MARK_QUEUED
}

export function toolFlow(status: string): FlowDir | null {
  return status === STATUS_RUNNING ? FLOW_TOOL : null
}

export type ToolHit = {
  sessionId: string | null
  id: string
  name: string
  status: ToolStatus
}

function clipHint(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  if (!t) return ""
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function firstHint(
  tool: string,
  parts: Array<string | null | undefined>,
  maxLen = Infinity,
): string {
  const skip = tool.toLowerCase()
  for (const p of parts) {
    let t = (p || "").replace(/\s+/g, " ").trim()
    if (!t) continue
    t = t.replace(/\s*\(@[^)]*subagent\)\s*$/i, "").trim()
    if (!t || t.toLowerCase() === skip) continue
    // Task `description` is 3–5 words. A long hit is almost certainly prompt text.
    if (t.length > maxLen) continue
    return t
  }
  return ""
}

/** Command / file / task-description hint — never prompt or output bodies. */
export function shortToolLabel(opts: {
  tool: string
  title?: string | null
  command?: string | null
  filePath?: string | null
  pattern?: string | null
  description?: string | null
  subagent?: string | null
  /** Wider clip for logs; the panel keeps the default. */
  maxHint?: number
}): string {
  const tool = (opts.tool || "tool").trim() || "tool"
  const max = opts.maxHint ?? 22
  const fileMax = max > 22 ? 32 : 14
  const patMax = max > 22 ? 40 : 12
  if (opts.filePath) return `${tool} ${clipHint(basenameOf(opts.filePath), fileMax)}`.trim()
  if (opts.pattern) return `${tool} ${clipHint(opts.pattern, patMax)}`.trim()
  const raw =
    firstHint(tool, [opts.description, opts.title], 80) ||
    firstHint(tool, [opts.command]) ||
    firstHint(tool, [opts.subagent], 80)
  const stripped = raw.replace(/^cd\s+\S+\s*(?:&&|;)\s*/i, "")
  if (max <= 22) {
    const fileish = stripped.match(/(?:^|[\s/\\])((?:[\w.-]+[/\\])*[\w.-]+\.[a-z0-9]{1,8})\b/i)
    if (fileish?.[1]) return clipHint(basenameOf(fileish[1]), 20)
    const bin = stripped.match(/\b(phpstan|rector|git|composer|npm|bun|uvx|graphify)\b/i)
    if (bin?.[1]) {
      const i = stripped.toLowerCase().indexOf(bin[1].toLowerCase())
      return clipHint(stripped.slice(i), max)
    }
  }
  if (stripped) return clipHint(stripped, max)
  return tool
}

/** A later live event may only have the bare tool name — keep the specific label. */
export function preferToolLabel(next: string, prev?: string | null): string {
  const a = (next || "").trim()
  const b = (prev || "").trim()
  if (!a) return b
  if (!b) return a
  const bare = (s: string) => {
    const t = s.toLowerCase()
    return t === TOOL_TASK || t === "tool" || t === TOOL_BASH || t === "unknown"
  }
  return bare(a) && !bare(b) ? b : a
}

function eventBags(evt: unknown): Record<string, unknown>[] {
  if (!evt || typeof evt !== "object") return []
  const o = evt as Record<string, unknown>
  const bags: Record<string, unknown>[] = []
  if (o.part && typeof o.part === "object") bags.push(o.part as Record<string, unknown>)
  if (o.properties && typeof o.properties === "object") {
    const props = o.properties as Record<string, unknown>
    bags.push(props)
    if (props.part && typeof props.part === "object") {
      bags.push(props.part as Record<string, unknown>)
    }
  }
  bags.push(o)
  return bags
}

function toolNameFromEvent(evt: unknown): string | null {
  const bags = eventBags(evt)
  let tool = ""
  let title: string | null = null
  let command: string | null = null
  let filePath: string | null = null
  let pattern: string | null = null
  let description: string | null = null
  let subagent: string | null = null
  for (const bag of bags) {
    if (!tool && typeof bag.tool === "string" && bag.tool.trim()) tool = bag.tool.trim()
    const state = bag.state && typeof bag.state === "object" ? (bag.state as Record<string, unknown>) : null
    const input =
      (state?.input && typeof state.input === "object" ? state.input : null) ||
      (bag.input && typeof bag.input === "object" ? bag.input : null)
    const inp = input as Record<string, unknown> | null
    if (!title && typeof state?.title === "string") title = state.title
    if (!command && typeof inp?.command === "string") command = inp.command
    if (!filePath && typeof inp?.filePath === "string") filePath = inp.filePath
    if (!pattern && typeof inp?.pattern === "string") pattern = inp.pattern
    if (!description && typeof inp?.description === "string") description = inp.description
    if (!subagent && typeof inp?.subagent_type === "string") subagent = inp.subagent_type
    if (!subagent && typeof inp?.category === "string") subagent = inp.category
  }
  if (!tool && !title && !command && !filePath && !description) return null
  return shortToolLabel({
    tool: tool || "tool",
    title,
    command,
    filePath,
    pattern,
    description,
    subagent,
  })
}

function toolIdFromEvent(evt: unknown): string | null {
  for (const bag of eventBags(evt)) {
    for (const key of ["callID", "callId", "toolCallId"]) {
      const x = bag[key]
      if (typeof x === "string" && x.trim()) return x.trim()
    }
    const id = bag.id
    if (typeof id === "string" && (id.startsWith("prt_") || id.startsWith("call_"))) return id
  }
  return null
}

function toolStatusFromEvent(evt: unknown): ToolHit["status"] | null {
  const type = eventType(evt)
  if (type.includes(EVENT_TOOL_FAILED)) return TOOL_STATUS_ERROR
  if (type.includes(EVENT_TOOL_SUCCESS) || type.includes(EVENT_TOOL_ENDED)) return TOOL_STATUS_COMPLETED
  if (type.includes(EVENT_TOOL_CALLED)) return TOOL_STATUS_RUNNING
  for (const bag of eventBags(evt)) {
    const state = bag.state && typeof bag.state === "object" ? (bag.state as Record<string, unknown>) : null
    const mapped = toToolStatus(String(state?.status ?? bag.status ?? ""))
    if (mapped === TOOL_STATUS_ERROR || mapped === TOOL_STATUS_COMPLETED || mapped === TOOL_STATUS_RUNNING) return mapped
  }
  if (type.includes(EVENT_MESSAGE_PART_UPDATED) && partKind(evt).includes("tool")) return null
  return null
}

/** Name + status only. Label hints (file/command/description), never prompt or output. */
export function toolHitFromEvent(evt: unknown): ToolHit | null {
  const status = toolStatusFromEvent(evt)
  if (!status) return null
  const id = toolIdFromEvent(evt)
  if (!id) return null
  const name = toolNameFromEvent(evt)
  if (!name) return null
  return { sessionId: sessionIdFromEvent(evt), id, name, status }
}

/** OpenCode session.cost (USD). Empty when zero / missing. */
export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return ""
  if (n < 0.01) return `$${n.toFixed(3)}`
  if (n < 10) return `$${n.toFixed(2)}`
  return `$${n.toFixed(0)}`
}

export function sessionIdFromEvent(evt: unknown): string | null {
  if (!evt || typeof evt !== "object") return null
  const walk = (v: unknown, depth: number): string | null => {
    if (!v || typeof v !== "object" || depth > 3) return null
    const o = v as Record<string, unknown>
    for (const key of ["sessionID", "sessionId", "session_id"]) {
      const x = o[key]
      if (typeof x === "string" && x.trim()) return x.trim()
    }
    for (const nest of ["info", "properties", "session", "payload"]) {
      const found = walk(o[nest], depth + 1)
      if (found) return found
    }
    return null
  }
  return walk(evt, 0)
}

export function stripSessionPrefix(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null
  const s = id.trim()
  if (!s) return null
  return s.startsWith("opencode:") ? s.slice("opencode:".length) : s
}
