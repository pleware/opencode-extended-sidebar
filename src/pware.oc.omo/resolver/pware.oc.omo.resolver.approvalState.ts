/**
 * pware.oc.omo.resolver.approvalstate
 *
 * Reads the planner session's `.omo/run-continuation` background-task marker.
 * Lives in the omo layer — no sibling domain may read omo files. The runtime
 * layer's my-work enrich module composes this marker with the session activity
 * state.
 */
import path from "node:path"
import { firstOmoPath } from "./pware.oc.omo.resolver.boulder.js"
import { readJson } from "../../pware.oc.core/pware.oc.core.paths.js"

/** First existing `.omo`/`.sisyphus` run-continuation directory, or null. */
export function firstRunContinuationDir(projectRoot: string): string | null {
  return firstOmoPath(projectRoot, "run-continuation")
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
  const raw = readJson(path.join(dir, `${sessionId}.json`)) as {
    sources?: { "background-task"?: { state?: unknown } }
  } | null
  const state = raw?.sources?.["background-task"]?.state
  return typeof state === "string" ? state : null
}
