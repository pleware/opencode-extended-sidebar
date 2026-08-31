/**
 * Temp project dirs with optional .omo/boulder.json.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { resetOesCache } from "../../src/pware.oc.core/pware.oc.core.oes.js"
import { resetRuntimeCache } from "../../src/pware.oc.runtime/resolver/index.js"
import { resetDocsCache } from "../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.doc.js"
import { resetPerfCache } from "../../src/pware.oc.perf/pware.oc.perf.reader.js"
import { resetApprovalsCache } from "../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.approval.js"

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
  oesignore?: string
  oes?: Record<string, unknown>
  plans?: Record<string, string>
  files?: Record<string, string>
  mtimes?: Record<string, number>
  /** Write `.omo/omo.jsonc` — the omo config marker, no boulder. */
  omo?: boolean
  /** Write `.sisyphus/omo.jsonc` — the marker under the legacy dir name. */
  sisyphus?: boolean
}): FixtureProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oes-proj-"))
  if (opts?.gitignore != null) {
    fs.writeFileSync(path.join(root, ".gitignore"), opts.gitignore)
  }
  if (opts?.oesignore != null) {
    fs.writeFileSync(path.join(root, ".oesignore"), opts.oesignore)
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
  if (opts?.omo) {
    fs.mkdirSync(path.join(root, ".omo"), { recursive: true })
    fs.writeFileSync(path.join(root, ".omo", "omo.jsonc"), "{}\n")
  }
  if (opts?.sisyphus) {
    fs.mkdirSync(path.join(root, ".sisyphus"), { recursive: true })
    fs.writeFileSync(path.join(root, ".sisyphus", "omo.jsonc"), "{}\n")
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
      resetRuntimeCache()
      resetDocsCache()
      resetPerfCache()
      resetApprovalsCache()
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
