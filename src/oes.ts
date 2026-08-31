/**
 * oes.json — OpenCode Extended Sidebar options.
 * Merge: plugin defaults < ~/.config/opencode/oes.json < <project>/oes.json
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { fileStamp, getOpenCodeConfigDir } from "./paths.js"
import { createStampCache } from "./cache.js"

export type OesOptions = {
  fileRows: number
  lineMax: number
  /** Ceiling for the OMO group's rows. 0 keeps it collapsed to its summary line. */
  omoRows: number
  /** Sessions compared under Perf → History. 0 hides the section. */
  perfHistory: number
  /** Rows per Perf section (models, tools, history). */
  perfRows: number
  /** How many recent turns Perf scans. Higher = longer history, slower read. */
  perfTurns: number
  sessionRows: number
  /** Directory names or relative path prefixes. Later oes.json replaces the list. */
  skipDirs: string[]
  /** Also hide Files that match the project's root .gitignore. Off by default. */
  skipGitignore: boolean
  toolRows: number
}

export const OES_DEFAULTS: OesOptions = {
  fileRows: 8,
  lineMax: 31,
  omoRows: 8,
  perfHistory: 3,
  perfRows: 5,
  perfTurns: 120,
  sessionRows: 4,
  skipDirs: ["tmp", ".tmp"],
  skipGitignore: false,
  toolRows: 8,
}

function pluginOesPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "oes.json")
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback
  return Math.round(Math.min(max, Math.max(min, n)))
}

function skipDirsOf(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string") continue
    const s = item.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim().toLowerCase()
    if (!s || s === "." || s === ".." || s.length > 64) continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= 16) break
  }
  return out
}

/** Merge one oes.json object onto a base. Exported for tests. */
export function pick(raw: Record<string, unknown> | null, base: OesOptions): OesOptions {
  if (!raw) return base
  return {
    fileRows: clamp(raw.fileRows, 3, 20, base.fileRows),
    lineMax: clamp(raw.lineMax, 20, 64, base.lineMax),
    omoRows: clamp(raw.omoRows, 0, 20, base.omoRows),
    perfHistory: clamp(raw.perfHistory, 0, 10, base.perfHistory),
    perfRows: clamp(raw.perfRows, 3, 20, base.perfRows),
    perfTurns: clamp(raw.perfTurns, 20, 500, base.perfTurns),
    sessionRows: clamp(raw.sessionRows, 2, 12, base.sessionRows),
    skipDirs: skipDirsOf(raw.skipDirs, base.skipDirs),
    skipGitignore: typeof raw.skipGitignore === "boolean" ? raw.skipGitignore : base.skipGitignore,
    toolRows: clamp(raw.toolRows, 3, 20, base.toolRows),
  }
}

function readJson(p: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(p)) return null
    const raw = JSON.parse(fs.readFileSync(p, "utf8"))
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null
  } catch {
    return null
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
