/**
 * oes.json — OpenCode Extended Sidebar options.
 * Merge: plugin defaults < ~/.config/opencode/oes.json < <project>/oes.json
 */
import path from "node:path"
import { fileStamp, getOpenCodeConfigDir, pluginRoot, readJson } from "./pware.oc.core.paths.js"
import { createStampCache } from "./pware.oc.core.cache.js"

export type OesOptions = {
  fileRows: number
  /** Sessions compared under Perf → History. 0 hides the section. */
  perfHistory: number
  /** Rows per Perf section (models, tools, history). */
  perfRows: number
  /** How many recent turns Perf scans. Higher = longer history, slower read. */
  perfTurns: number
  /** Sessions fetched for the recent-sessions window. */
  sessionFetch: number
  /** Hide Files that match the project's root .gitignore. Off by default. */
  skipGitignore: boolean
  toolRows: number
  /** Tool-call history kept for the feed's `… +N more` revealer. Distinct from `toolRows`. */
  toolFetch: number
}

export const OES_DEFAULTS: OesOptions = {
  fileRows: 8,
  perfHistory: 3,
  perfRows: 5,
  perfTurns: 120,
  sessionFetch: 20,
  skipGitignore: false,
  toolRows: 5,
  toolFetch: 20,
}

function pluginOesPath(): string {
  return path.join(pluginRoot(), "oes.json")
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback
  return Math.round(Math.min(max, Math.max(min, n)))
}

/** Merge one oes.json object onto a base. Exported for tests. */
export function pick(raw: Record<string, unknown> | null, base: OesOptions): OesOptions {
  if (!raw) return base
  const toolRows = clamp(raw.toolRows, 3, 20, base.toolRows)
  return {
    fileRows: clamp(raw.fileRows, 3, 20, base.fileRows),
    perfHistory: clamp(raw.perfHistory, 0, 10, base.perfHistory),
    perfRows: clamp(raw.perfRows, 3, 20, base.perfRows),
    perfTurns: clamp(raw.perfTurns, 20, 500, base.perfTurns),
    sessionFetch: clamp(raw.sessionFetch, 2, 80, base.sessionFetch),
    skipGitignore: typeof raw.skipGitignore === "boolean" ? raw.skipGitignore : base.skipGitignore,
    toolRows,
    toolFetch: clamp(raw.toolFetch, toolRows, 80, base.toolFetch),
  }
}

export function oesPaths(projectRoot?: string | null): string[] {
  const out = [pluginOesPath(), path.join(getOpenCodeConfigDir(), "oes.json")]
  if (projectRoot) out.push(path.join(projectRoot, "oes.json"))
  return out
}

export function oesStamp(projectRoot?: string | null): string {
  return oesPaths(projectRoot).map(fileStamp).join("|")
}

const oesCache = createStampCache<OesOptions>()

/** Drop the merged-options cache so the next getOes re-reads files. */
export function resetOesCache(): void {
  oesCache.reset()
}

export function getOes(projectRoot?: string | null): OesOptions {
  return oesCache.get(oesStamp(projectRoot), () => {
    let next = { ...OES_DEFAULTS }
    for (const p of oesPaths(projectRoot)) next = pick(readJson(p), next)
    return next
  })
}
