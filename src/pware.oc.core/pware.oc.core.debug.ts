/**
 * Optional file-based debug + profile loggers, plus a tiny on-screen event
 * ring for the sidebar's read-only debug console.
 *
 * Debug:   OES_DEBUG_OPENCODE=1          → writes to <plugin>/logs/
 * Profile: OES_DEBUG_PROFILE=1           → writes to <plugin>/logs/
 * Either  OES_DEBUG_*=/some/dir          → writes to that directory
 *
 * Each session appends a single oes-debug-<date>.log / oes-profile-<date>.log
 * file. Lines are newline-delimited JSON:
 *   debug   → { ts, tag, msg, data? }
 *   profile → { ts, tag, ms, data? }
 * All writes are silent on error — the plugin never crashes because of logging.
 *
 * The screen ring (`pushScreenLine`) is a module-level 200-line buffer of short
 * labels (e.g. `db open`) that the sidebar console subscribes to; it is only
 * fed while a logger is active, so production pays nothing.
 */
import fs from "node:fs"
import path from "node:path"
import { pluginRoot } from "./pware.oc.core.paths.js"

const DEBUG_ENV_KEY = "OES_DEBUG_OPENCODE"
const PROFILE_ENV_KEY = "OES_DEBUG_PROFILE"

function pluginLogsDir(): string {
  return path.join(pluginRoot(), "logs")
}

function resolveLogDir(
  envKey: string,
  env: Record<string, string | undefined>,
  defaultDir?: string,
): string | null {
  const val = env[envKey]
  if (!val) return null
  const trimmed = val.trim()
  if (!trimmed) return null
  const FALSY = new Set(["0", "false", "no", "off"])
  if (FALSY.has(trimmed.toLowerCase())) return null
  const TRUTHY = new Set(["1", "true", "yes", "on"])
  if (TRUTHY.has(trimmed.toLowerCase())) return defaultDir ?? pluginLogsDir()
  return trimmed
}

/** Returns the debug log directory, or null when debug is off. Exported for tests. */
export function debugLogDir(
  env: Record<string, string | undefined> = process.env,
  defaultDir?: string,
): string | null {
  return resolveLogDir(DEBUG_ENV_KEY, env, defaultDir)
}

/** Returns the profile log directory, or null when profiling is off. Exported for tests. */
export function profileLogDir(
  env: Record<string, string | undefined> = process.env,
  defaultDir?: string,
): string | null {
  return resolveLogDir(PROFILE_ENV_KEY, env, defaultDir)
}

/** True when the debug logger is active — env on AND its log dir resolved/writable. */
export function debugActive(): boolean {
  return resolvedDir() !== null
}

export function debugActiveDir(): string | null {
  return resolvedDir()
}

/** True when the profile logger is active — env on AND its log dir resolved/writable. */
export function profileActive(): boolean {
  return profileResolvedDir() !== null
}

export function profileActiveDir(): string | null {
  return profileResolvedDir()
}

function datedLogFile(prefix: string): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `oes-${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`
}

let _dir: string | null | undefined = undefined // undefined = not resolved yet
let _pdir: string | null | undefined = undefined

function resolvedDir(): string | null {
  if (_dir !== undefined) return _dir
  _dir = debugLogDir()
  if (_dir) {
    try {
      fs.mkdirSync(_dir, { recursive: true })
    } catch {
      _dir = null
    }
  }
  return _dir
}

function profileResolvedDir(): string | null {
  if (_pdir !== undefined) return _pdir
  _pdir = profileLogDir()
  if (_pdir) {
    try {
      fs.mkdirSync(_pdir, { recursive: true })
    } catch {
      _pdir = null
    }
  }
  return _pdir
}

/** Reset cached state (test helper). */
export function resetDebug(): void {
  _dir = undefined
  _pdir = undefined
  profileStats = {}
  screenLines = []
}

/** One on-screen console line: a timestamp plus a short label (e.g. `db open`). */
export type ScreenLine = { at: number; text: string }

/** Ring cap — the console shows a 5-line window over these, scrolled. */
const SCREEN_MAX = 200

let screenLines: ScreenLine[] = []
const screenListeners = new Set<() => void>()

/**
 * Append one short label (e.g. `db open`) to the sidebar console's screen ring
 * and notify subscribers. No-op unless a debug or profile logger is active, so
 * a normal session pays nothing for it.
 */
export function pushScreenLine(text: string): void {
  if (!debugActive() && !profileActive()) return
  screenLines.push({ at: Date.now(), text })
  if (screenLines.length > SCREEN_MAX) screenLines.splice(0, screenLines.length - SCREEN_MAX)
  for (const listener of screenListeners) {
    try {
      listener()
    } catch {
      // a subscriber must never break the ring feed
    }
  }
}

/** Newest-first copy of the screen ring (empty when nothing was pushed). */
export function readScreenLines(): ScreenLine[] {
  return screenLines.slice().reverse()
}

/** Subscribe to screen-ring pushes; returns an unsubscribe fn. */
export function subscribeScreenLines(listener: () => void): () => void {
  screenListeners.add(listener)
  return () => {
    screenListeners.delete(listener)
  }
}

function appendLine(dir: string, file: string, line: Record<string, unknown>): void {
  try {
    const entry = { ts: new Date().toISOString(), ...line }
    fs.appendFileSync(path.join(dir, file), JSON.stringify(entry) + "\n", "utf8")
  } catch {
    // silent — logging must never crash the plugin
  }
}

/**
 * Append one JSON-line entry to the debug log.
 * No-op when OES_DEBUG_OPENCODE is not set or falsy.
 */
export function dbg(tag: string, msg: string, data?: unknown): void {
  const dir = resolvedDir()
  if (!dir) return
  appendLine(dir, datedLogFile("debug"), {
    tag,
    msg,
    ...(data !== undefined ? { data } : {}),
  })
}

export type ProfileStats = { n: number; sum: number; max: number }

/** In-memory per-tag totals, updated only while OES_DEBUG_PROFILE is on. */
let profileStats: Record<string, ProfileStats> = {}

/** Lazily-computed or plain profile data — a factory keeps the call site free when off. */
type ProfileData = Record<string, unknown> | (() => Record<string, unknown>)

function resolveData(data: ProfileData | undefined): Record<string, unknown> | undefined {
  const d = typeof data === "function" ? data() : data
  return d && Object.keys(d).length > 0 ? d : undefined
}

function recordProfile(tag: string, ms: number, data?: ProfileData): void {
  const dir = profileResolvedDir()
  if (!dir) return
  const s = (profileStats[tag] ??= { n: 0, sum: 0, max: 0 })
  s.n += 1
  s.sum += ms
  if (ms > s.max) s.max = ms
  const d = resolveData(data)
  appendLine(dir, datedLogFile("profile"), {
    tag,
    ms,
    ...(d !== undefined ? { data: d } : {}),
  })
}

/**
 * Measure fn with performance.now() and append one { tag, ms, data? } line to
 * the profile log. No-op when OES_DEBUG_PROFILE is not set or falsy. Returns
 * fn's result; throws propagate.
 */
export function profile<T>(tag: string, fn: () => T, data?: ProfileData): T {
  if (!profileResolvedDir()) return fn()
  const t0 = performance.now()
  try {
    return fn()
  } finally {
    recordProfile(tag, performance.now() - t0, data)
  }
}

/**
 * Same as profile(), but for an async fn — measures until the returned promise
 * settles. The fn is invoked immediately (the promise is what is timed).
 */
export function profileAsync<T>(
  tag: string,
  fn: () => Promise<T>,
  data?: ProfileData,
): Promise<T> {
  if (!profileResolvedDir()) return fn()
  const t0 = performance.now()
  return fn().then(
    (value) => {
      recordProfile(tag, performance.now() - t0, data)
      return value
    },
    (err) => {
      recordProfile(tag, performance.now() - t0, data)
      throw err
    },
  )
}

/** Shallow copy of the per-tag profile totals. Empty when profiling is off. */
export function readProfileStats(): Record<string, ProfileStats> {
  const out: Record<string, ProfileStats> = {}
  for (const [tag, s] of Object.entries(profileStats)) out[tag] = { ...s }
  return out
}

/**
 * Append one `summary` line with the per-tag totals (n, total ms, avg, max) to
 * the profile log. No-op when profiling is off or nothing was measured.
 */
export function writeProfileSummary(): void {
  const dir = profileResolvedDir()
  if (!dir) return
  const stats = readProfileStats()
  const tags = Object.keys(stats)
  if (tags.length === 0) return
  const summary: Record<string, { n: number; total: number; avg: number; max: number }> = {}
  for (const tag of tags) {
    const s = stats[tag]
    summary[tag] = {
      n: s.n,
      total: Math.round(s.sum * 10) / 10,
      avg: Math.round((s.sum / s.n) * 10) / 10,
      max: Math.round(s.max * 10) / 10,
    }
  }
  appendLine(dir, datedLogFile("profile"), { tag: "summary", data: summary })
}
