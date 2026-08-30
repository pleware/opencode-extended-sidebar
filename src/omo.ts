/**
 * Read-only oh-my-openagent helpers (boulder + plan + config).
 * Zero deps — only node:fs / node:path / os.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { canonicalizePath, fileStamp } from "./paths.js"

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

export type OmoSnapshot = {
  present: boolean
  boulderPath: string | null
  planPath: string | null
  status: string | null
  agent: string | null
  planName: string | null
  plan: { total: number; completed: number; percent: number; steps: PlanStep[] }
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
  task_title?: string
  session_id?: string
  agent?: string
  status?: string
  updated_at?: string | number
  started_at?: string | number
}

function parseStamp(v: string | number | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim()) {
    const n = Date.parse(v)
    return Number.isNaN(n) ? null : n
  }
  return null
}

type RawBoulder = {
  plan_name?: string
  active_plan?: string
  active_work_id?: string
  agent?: string
  status?: string
  task_sessions?: Record<string, RawTask>
  works?: Record<
    string,
    {
      plan_name?: string
      active_plan?: string
      agent?: string
      status?: string
      task_sessions?: Record<string, RawTask>
    }
  >
}

function stripSessionPrefix(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null
  const s = id.trim()
  if (!s) return null
  return s.startsWith("opencode:") ? s.slice("opencode:".length) : s
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

function parsePlan(content: string): PlanStep[] {
  const steps: PlanStep[] = []
  for (const raw of content.split(/\r?\n/)) {
    const m = raw.trim().match(/^[-*]\s*\[(\s|x|X)\]\s*(.*)$/)
    if (!m) continue
    steps.push({
      checked: m[1] === "x" || m[1] === "X",
      text: (m[2] ?? "").trim(),
    })
  }
  return steps.slice(0, 40)
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

function readPlanSteps(planPath: string | null): PlanStep[] {
  if (!planPath) return []
  try {
    return parsePlan(fs.readFileSync(planPath, "utf8"))
  } catch {
    return []
  }
}

function normalizeDelegates(raw: Record<string, RawTask> | undefined): Delegate[] {
  if (!raw) return []
  const list: Delegate[] = []
  for (const [key, t] of Object.entries(raw)) {
    if (!t || typeof t !== "object") continue
    list.push({
      taskKey: t.task_key || key,
      title: t.task_title || key,
      sessionId: stripSessionPrefix(t.session_id),
      agent: t.agent ?? null,
      status: (t.status || "unknown").toLowerCase(),
      updatedAt: parseStamp(t.updated_at) ?? parseStamp(t.started_at),
    })
  }
  const rank = (s: string) => {
    if (s === "running" || s === "in_progress" || s === "active") return 0
    if (s === "pending" || s === "queued") return 1
    if (s === "error" || s === "failed") return 2
    if (s === "completed" || s === "done") return 3
    return 4
  }
  list.sort((a, b) => rank(a.status) - rank(b.status) || a.title.localeCompare(b.title))
  return list.slice(0, 40)
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

  let planName = raw.plan_name ?? null
  let activePlan = raw.active_plan ?? null
  let agent = raw.agent ?? null
  let status = raw.status ?? null
  let tasks = raw.task_sessions
  const workId = raw.active_work_id
  if (workId && raw.works?.[workId]) {
    const w = raw.works[workId]
    planName = planName || w.plan_name || null
    activePlan = activePlan || w.active_plan || null
    agent = agent || w.agent || null
    status = status || w.status || null
    if (!tasks || !Object.keys(tasks).length) tasks = w.task_sessions
  }

  const planPath = resolvePlanPath(root, activePlan)
  const steps = readPlanSteps(planPath)
  const completed = steps.filter((s) => s.checked).length
  const total = steps.length

  return {
    present: true,
    boulderPath,
    planPath,
    status,
    agent,
    planName,
    plan: {
      total,
      completed,
      percent: total ? Math.round((completed / total) * 100) : 0,
      steps,
    },
    delegates: normalizeDelegates(tasks),
    stamp: `${fileStamp(boulderPath)}|${fileStamp(planPath)}`,
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
