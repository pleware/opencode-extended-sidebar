/**
 * pware.oc.omo.resolver.approvalstate
 *
 * Reads the planner session's `.omo/run-continuation` background-task marker.
 * Lives in the omo layer — no sibling domain may read omo files. The runtime
 * layer's my-work enrich module composes this marker with the session activity
 * state.
 */
import fs from "node:fs"
import path from "node:path"
import { findOmoWatchDirs } from "./pware.oc.omo.resolver.boulder.js"

/** First existing `.omo`/`.sisyphus` run-continuation directory, or null. */
export function firstRunContinuationDir(projectRoot: string): string | null {
  for (const omoDir of findOmoWatchDirs(projectRoot)) {
    const p = path.join(omoDir, "run-continuation")
    if (fs.existsSync(p)) return p
  }
  return null
}

/**
 * The `.omo/run-continuation` background-task state for a session, or null when
 * absent/unreadable.
 */
export function readRunContinuationState(
  projectRoot: string | null | undefined,
  sessionId: string,
): string | null {
  if (!projectRoot) return null
  const dir = firstRunContinuationDir(projectRoot)
  if (!dir) return null
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(dir, `${sessionId}.json`), "utf8"),
    ) as { sources?: { "background-task"?: { state?: unknown } } }
    const state = raw?.sources?.["background-task"]?.state
    return typeof state === "string" ? state : null
  } catch {
    return null
  }
}
