/**
 * Read-only oh-my-openagent helpers (boulder + plans + delegates + config).
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { canonicalizePath, fileStamp, resolveProjectFile } from "./paths.js"
import { composeMark, formatAge, pulseAgeMs, toEpochMs, type AgentMark } from "./pulse.js"
import {
  taskRank,
  toWorkLabel,
  workIsTerminal,
  workStatusGlyph,
} from "./status.js"

export { workIsTerminal, workStatusGlyph }
export { toWorkLabel as workStatusLabel }

export type PlanStep = { checked: boolean; text: string }

export type Delegate = {
  taskKey: string
  title: string
  sessionId: string | null
  agent: string | null
  status: string
  /** Boulder updated_at / started_at — fallback pulse when no session row. */
  updatedAt: number | null
}

export type BoulderSession = {
  id: string
  /** `direct` opened the work, `appended` was pulled in later. */
  origin: "direct" | "appended" | null
}

/** One `task_sessions` entry: a plan unit handed to a subagent. */
export type TaskView = {
  taskKey: string
  /** Short label from the plan (`todo:3`), when boulder recorded one. */
  label: string | null
  title: string
  sessionId: string | null
  agent: string | null
  category: string | null
  status: string
  startedAt: number | null
  endedAt: number | null
  elapsedMs: number | null
  updatedAt: number | null
}

/** One boulder run. Keyed by `work_id` — the same plan run twice is two works. */
export type WorkView = {
  workId: string
  name: string
  status: string
  sessionId: string | null
  sessions: BoulderSession[]
  agent: string | null
  /** Project-relative plan markdown path, when boulder lists active_plan. */
  planPath: string | null
  startedAt: number | null
  updatedAt: number | null
  endedAt: number | null
  elapsedMs: number | null
  current: boolean
}

/** The active work, as mirrored on the boulder root. Blank when nothing is live. */
export type BoulderView = {
  workId: string | null
  name: string | null
  status: string | null
  agent: string | null
  startedAt: number | null
  updatedAt: number | null
  endedAt: number | null
  elapsedMs: number | null
  sessions: BoulderSession[]
  tasks: TaskView[]
  counts: { running: number; done: number; other: number; total: number }
}

export type OmoSnapshot = {
  present: boolean
  boulderPath: string | null
  planPath: string | null
  status: string | null
  agent: string | null
  planName: string | null
  plan: { total: number; completed: number; percent: number; steps: PlanStep[] }
  works: WorkView[]
  boulder: BoulderView
  delegates: Delegate[]
  stamp: string
}

export type OmoConfigView = {
  present: boolean
  path: string | null
  teamMode: boolean | null
  agents: string[]
}

type RawTask = {
  task_key?: string
  task_label?: string
  task_title?: string
  session_id?: string
  agent?: string
  category?: string
  status?: string
  updated_at?: string | number
  started_at?: string | number
  ended_at?: string | number
  elapsed_ms?: number
}

function parseStamp(v: string | number | undefined): number | null {
  return toEpochMs(v)
}

type RawWork = {
  plan_name?: string
  active_plan?: string
  agent?: string
  status?: string
  updated_at?: string | number
  started_at?: string | number
  ended_at?: string | number
  elapsed_ms?: number
  session_ids?: string[]
  session_origins?: Record<string, string>
  task_sessions?: Record<string, RawTask>
}

type RawBoulder = RawWork & {
  active_work_id?: string
  works?: Record<string, RawWork>
}

function stripSessionPrefix(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null
  const s = id.trim()
  if (!s) return null
  return s.startsWith("opencode:") ? s.slice("opencode:".length) : s
}

function lastSessionId(ids: string[] | undefined): string | null {
  if (!ids?.length) return null
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = stripSessionPrefix(ids[i])
    if (id) return id
  }
  return null
}

function planLabel(name: string | null | undefined, activePlan: string | null | undefined): string {
  const n = typeof name === "string" ? name.trim() : ""
  if (n) return n
  if (activePlan && typeof activePlan === "string") {
    const base = path.basename(activePlan.replace(/\\/g, "/")).replace(/\.md$/i, "")
    if (base) return base
  }
  return "plan"
}

/** One row's mark / glyph / age suffix for the OMO works list. */
export function workRowView(
  work: { status: string; updatedAt: number | null },
  now: number,
  seen?: number | null,
): { mark: AgentMark; glyph: string | null; suffix: string } {
  const ageMs = pulseAgeMs(now, work.updatedAt, seen)
  const mark = workIsTerminal(work.status)
    ? toWorkLabel(work.status) === "error"
      ? "error"
      : "ready"
    : composeMark({ lifecycle: work.status, ageMs })
  return {
    mark,
    glyph: workStatusGlyph(work.status),
    suffix: formatAge(ageMs),
  }
}

function relativePlanPath(projectRoot: string, activePlan: string | null | undefined): string | null {
  return resolveProjectFile(projectRoot, activePlan)?.rel ?? null
}

function collectSessions(
  ids: string[] | undefined,
  origins: Record<string, string> | undefined,
): BoulderSession[] {
  if (!Array.isArray(ids)) return []
  const out: BoulderSession[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = stripSessionPrefix(raw)
    if (!id || seen.has(id)) continue
    seen.add(id)
    // Boulder keys origins by the stored id, prefixed or not.
    const hint = origins?.[String(raw)] ?? origins?.[id] ?? null
    const origin = hint === "direct" || hint === "appended" ? hint : null
    out.push({ id, origin })
  }
  return out.slice(0, 24)
}

function asWork(
  workId: string,
  w: RawWork,
  current: boolean,
  projectRoot: string,
  fallbackPlan?: string | null,
): WorkView {
  const activePlan = w.active_plan || fallbackPlan || null
  const sessions = collectSessions(w.session_ids, w.session_origins)
  return {
    workId,
    name: planLabel(w.plan_name, activePlan),
    status: (w.status || "unknown").toLowerCase(),
    sessionId: lastSessionId(w.session_ids),
    sessions,
    agent: w.agent ?? null,
    planPath: relativePlanPath(projectRoot, activePlan),
    startedAt: parseStamp(w.started_at),
    updatedAt: parseStamp(w.updated_at) ?? parseStamp(w.started_at),
    endedAt: parseStamp(w.ended_at),
    elapsedMs: typeof w.elapsed_ms === "number" && Number.isFinite(w.elapsed_ms) ? w.elapsed_ms : null,
    current,
  }
}

/**
 * Boulder runs, newest first, active pinned to the top. Keyed by `work_id`, so
 * two runs of the same plan stay two rows. The root fields are a mirror of the
 * active work — they only become a work of their own on a legacy state with no
 * `works` map.
 */
function collectWorks(raw: RawBoulder, projectRoot: string): WorkView[] {
  const out: WorkView[] = []
  const workId = raw.active_work_id ?? null
  const entries =
    raw.works && typeof raw.works === "object" && !Array.isArray(raw.works)
      ? Object.entries(raw.works)
      : []

  for (const [id, w] of entries) {
    if (!w || typeof w !== "object") continue
    if (!(w.plan_name || w.active_plan || w.status)) continue
    out.push(asWork(id, w, Boolean(workId && id === workId), projectRoot, raw.active_plan))
  }

  if (out.length === 0 && (raw.plan_name || raw.active_plan || raw.status)) {
    out.push(asWork(workId || "active", raw, true, projectRoot))
  }

  out.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  })

  // A dangling active_work_id leaves nobody current; boulder itself then mirrors
  // the most recently updated work.
  if (out.length > 0 && !out.some((w) => w.current)) out[0]!.current = true
  return out.slice(0, 20)
}

/** Boulder file only — drafts/notepads/evidence must not invalidate the hot path. */
export function omoStamp(projectRoot?: string | null): string {
  if (!projectRoot) return "0"
  const boulderPath = findBoulder(canonicalizePath(projectRoot))
  if (!boulderPath) return "0"
  return fileStamp(boulderPath)
}

export function findBoulder(projectRoot: string): string | null {
  for (const rel of [".omo/boulder.json", ".sisyphus/boulder.json"]) {
    const p = path.join(projectRoot, rel)
    if (fs.existsSync(p)) return p
  }
  return null
}

export function findOmoWatchDirs(projectRoot: string): string[] {
  const out: string[] = []
  for (const rel of [".omo", ".sisyphus"]) {
    const p = path.join(projectRoot, rel)
    if (fs.existsSync(p)) out.push(p)
  }
  return out
}

function resolvePlanPath(projectRoot: string, activePlan: string | null): string | null {
  if (!activePlan) return null
  const planPath = path.isAbsolute(activePlan)
    ? activePlan
    : path.join(projectRoot, activePlan)
  try {
    const root = path.resolve(projectRoot)
    const real = path.resolve(planPath)
    if (!real.startsWith(root) || !fs.existsSync(real)) return null
    return real
  } catch {
    return null
  }
}

function collectTasks(raw: Record<string, RawTask> | undefined): TaskView[] {
  if (!raw || typeof raw !== "object") return []
  const list: TaskView[] = []
  for (const [key, t] of Object.entries(raw)) {
    if (!t || typeof t !== "object") continue
    list.push({
      taskKey: t.task_key || key,
      label: t.task_label ?? null,
      title: t.task_title || key,
      sessionId: stripSessionPrefix(t.session_id),
      agent: t.agent ?? null,
      category: t.category ?? null,
      status: (t.status || "unknown").toLowerCase(),
      startedAt: parseStamp(t.started_at),
      endedAt: parseStamp(t.ended_at),
      elapsedMs: typeof t.elapsed_ms === "number" && Number.isFinite(t.elapsed_ms) ? t.elapsed_ms : null,
      updatedAt: parseStamp(t.updated_at) ?? parseStamp(t.started_at),
    })
  }
  list.sort((a, b) => taskRank(a.status) - taskRank(b.status) || a.title.localeCompare(b.title))
  return list.slice(0, 40)
}

function taskToDelegate(t: TaskView): Delegate {
  return {
    taskKey: t.taskKey,
    title: t.title,
    sessionId: t.sessionId,
    agent: t.agent,
    status: t.status,
    updatedAt: t.updatedAt,
  }
}

function countTasks(tasks: readonly TaskView[]): BoulderView["counts"] {
  let running = 0
  let done = 0
  for (const t of tasks) {
    const r = taskRank(t.status)
    if (r === 0) running += 1
    else if (r === 3) done += 1
  }
  return { running, done, other: tasks.length - running - done, total: tasks.length }
}

export function emptyBoulder(): BoulderView {
  return {
    workId: null,
    name: null,
    status: null,
    agent: null,
    startedAt: null,
    updatedAt: null,
    endedAt: null,
    elapsedMs: null,
    sessions: [],
    tasks: [],
    counts: { running: 0, done: 0, other: 0, total: 0 },
  }
}

/** The task boulder is on right now, if any. */
export function currentTask(boulder: BoulderView): TaskView | null {
  return boulder.tasks.find((t) => taskRank(t.status) === 0) ?? null
}

export function emptyOmo(): OmoSnapshot {
  return {
    present: false,
    boulderPath: null,
    planPath: null,
    status: null,
    agent: null,
    planName: null,
    plan: { total: 0, completed: 0, percent: 0, steps: [] },
    works: [],
    boulder: emptyBoulder(),
    delegates: [],
    stamp: "0",
  }
}

/** Read boulder + plan for a project directory. Never throws. */
export function readOmo(projectRoot: string | null | undefined): OmoSnapshot {
  if (!projectRoot) return emptyOmo()
  const root = canonicalizePath(projectRoot)
  const boulderPath = findBoulder(root)
  if (!boulderPath) return emptyOmo()

  let raw: RawBoulder
  try {
    raw = JSON.parse(fs.readFileSync(boulderPath, "utf8")) as RawBoulder
  } catch {
    return { ...emptyOmo(), boulderPath, stamp: fileStamp(boulderPath) }
  }

  const works = collectWorks(raw, root)
  const active = works.find((w) => w.current) ?? null
  // Root fields mirror the active work; fall back to the work entry itself.
  const mirror: RawWork = (active && raw.works?.[active.workId]) || raw

  const planName = raw.plan_name || mirror.plan_name || null
  const activePlan = raw.active_plan || mirror.active_plan || null
  const agent = raw.agent || mirror.agent || null
  const status = raw.status || mirror.status || null
  const rootTasks = raw.task_sessions
  const tasks = collectTasks(
    rootTasks && Object.keys(rootTasks).length ? rootTasks : mirror.task_sessions,
  )

  const planPath = resolvePlanPath(root, activePlan)
  // Plan checklist is not shown in the sidebar; Docs reads the file on demand.

  return {
    present: true,
    boulderPath,
    planPath,
    status,
    agent,
    planName,
    plan: { total: 0, completed: 0, percent: 0, steps: [] },
    works,
    boulder: {
      workId: active?.workId ?? null,
      name: active?.name ?? planName,
      status: active?.status ?? status,
      agent: active?.agent ?? agent,
      startedAt: active?.startedAt ?? parseStamp(raw.started_at),
      updatedAt: active?.updatedAt ?? parseStamp(raw.updated_at),
      endedAt: active?.endedAt ?? parseStamp(raw.ended_at),
      elapsedMs: active?.elapsedMs ?? null,
      sessions: active?.sessions ?? collectSessions(raw.session_ids, raw.session_origins),
      tasks,
      counts: countTasks(tasks),
    },
    delegates: tasks.map(taskToDelegate),
    stamp: fileStamp(boulderPath),
  }
}

export function readOmoConfig(): OmoConfigView {
  const home = os.homedir()
  const candidates = [
    path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "opencode", "oh-my-openagent.json"),
    path.join(home, ".config", "opencode", "oh-my-openagent.json"),
  ]
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
        team_mode?: { enabled?: boolean }
        agents?: Record<string, unknown>
      }
      return {
        present: true,
        path: p,
        teamMode: raw.team_mode?.enabled ?? null,
        agents: Object.keys(raw.agents || {}),
      }
    } catch {
      // next
    }
  }
  return { present: false, path: null, teamMode: null, agents: [] }
}
