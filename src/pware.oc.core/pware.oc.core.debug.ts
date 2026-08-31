/**
 * Optional file-based debug logger.
 *
 * Activated by setting OES_DEBUG_OPENCODE in the environment:
 *   OES_DEBUG_OPENCODE=1          → writes to <plugin>/logs/
 *   OES_DEBUG_OPENCODE=/some/dir  → writes to that directory
 *
 * Each session appends a single oes-debug-<date>.log file.
 * Lines are newline-delimited JSON: { ts, tag, msg, data? }.
 * All writes are silent on error — the plugin never crashes because of logging.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pluginRoot } from "./pware.oc.core.paths.js"

const ENV_KEY = "OES_DEBUG_OPENCODE"

function pluginLogsDir(): string {
  return path.join(pluginRoot(), "logs")
}

/** Returns the log directory, or null when debug is off. Exported for tests. */
export function debugLogDir(
  env: Record<string, string | undefined> = process.env,
  defaultDir?: string,
): string | null {
  const val = env[ENV_KEY]
  if (!val) return null
  const trimmed = val.trim()
  if (!trimmed) return null
  const FALSY = new Set(["0", "false", "no", "off"])
  if (FALSY.has(trimmed.toLowerCase())) return null
  const TRUTHY = new Set(["1", "true", "yes", "on"])
  if (TRUTHY.has(trimmed.toLowerCase())) return defaultDir ?? pluginLogsDir()
  return trimmed
}

function logFileName(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `oes-debug-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`
}

let _dir: string | null | undefined = undefined // undefined = not resolved yet

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

/** Reset cached state (test helper). */
export function resetDebug(): void {
  _dir = undefined
}

/**
 * Append one JSON-line entry to the debug log.
 * No-op when OES_DEBUG_OPENCODE is not set or falsy.
 */
export function dbg(tag: string, msg: string, data?: unknown): void {
  const dir = resolvedDir()
  if (!dir) return
  try {
    const line =
      JSON.stringify({ ts: new Date().toISOString(), tag, msg, ...(data !== undefined ? { data } : {}) }) + "\n"
    fs.appendFileSync(path.join(dir, logFileName()), line, "utf8")
  } catch {
    // silent — logging must never crash the plugin
  }
}
