/**
 * Temp project dirs with optional .omo/boulder.json.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { resetOesCache } from "../../src/oes.js"
import { resetLiveCache } from "../../src/live.js"
import { resetDocsCache } from "../../src/docs.js"
import { resetPerfCache } from "../../src/perf.js"

export type BoulderTask = {
  task_key?: string
  task_title?: string
  session_id?: string
  agent?: string
  status?: string
}

export type FixtureProject = {
  root: string
  dispose: () => void
}

export function createFixtureProject(opts?: {
  boulder?: Record<string, unknown> | null
  gitignore?: string
  oes?: Record<string, unknown>
  plans?: Record<string, string>
  files?: Record<string, string>
  mtimes?: Record<string, number>
}): FixtureProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oes-proj-"))
  if (opts?.gitignore != null) {
    fs.writeFileSync(path.join(root, ".gitignore"), opts.gitignore)
  }
  if (opts?.oes) {
    fs.writeFileSync(path.join(root, "oes.json"), JSON.stringify(opts.oes))
  }
  for (const [rel, body] of Object.entries({ ...opts?.files, ...opts?.plans })) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  for (const [rel, ms] of Object.entries(opts?.mtimes ?? {})) {
    const abs = path.join(root, rel)
    fs.utimesSync(abs, new Date(ms), new Date(ms))
  }
  if (opts?.boulder) {
    const omo = path.join(root, ".omo")
    fs.mkdirSync(omo, { recursive: true })
    fs.writeFileSync(path.join(omo, "boulder.json"), JSON.stringify(opts.boulder))
  }
  return {
    root,
    dispose: () => {
      resetOesCache()
      resetLiveCache()
      resetDocsCache()
      resetPerfCache()
      try {
        fs.rmSync(root, { recursive: true, force: true })
      } catch {
        // ignore
      }
    },
  }
}

export function boulderWithTask(opts: {
  taskSessionId: string
  title?: string
  agent?: string
  status?: string
}): Record<string, unknown> {
  const task: BoulderTask = {
    task_key: "task_1",
    task_title: opts.title ?? "foreign work",
    session_id: opts.taskSessionId,
    agent: opts.agent ?? "delegate",
    status: opts.status ?? "running",
  }
  return {
    status: "in_progress",
    agent: "oracle",
    plan_name: "plan",
    task_sessions: { task_1: task },
  }
}
