/**
 * Resolve OpenCode data paths (XDG + Windows + OPENCODE_DB_PATH).
 * Zero deps — node:fs / path / os only.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export type Env = Record<string, string | undefined>

export function getDataDir(env: Env = process.env, homedir = os.homedir()): string {
  let dataDir = env.XDG_DATA_HOME
  if (dataDir) {
    if (dataDir === "~") dataDir = homedir
    else if (dataDir.startsWith("~/") || dataDir.startsWith("~\\")) {
      dataDir = path.join(homedir, dataDir.slice(2).replace(/[\\/]+/g, path.sep))
    }
  }
  return dataDir ?? path.join(homedir, ".local", "share")
}

export function getOpenCodeConfigDir(env: Env = process.env, homedir = os.homedir()): string {
  const xdg = env.XDG_CONFIG_HOME
  if (xdg) {
    const root = xdg === "~" ? homedir : xdg.startsWith("~/") || xdg.startsWith("~\\")
      ? path.join(homedir, xdg.slice(2).replace(/[\\/]+/g, path.sep))
      : xdg
    return path.join(root, "opencode")
  }
  return path.join(homedir, ".config", "opencode")
}

export function getOpenCodeRoot(env: Env = process.env, homedir = os.homedir()): string {
  return path.join(getDataDir(env, homedir), "opencode")
}

export function getOpenCodeDbPath(env: Env = process.env, homedir = os.homedir()): string {
  if (env.OPENCODE_DB_PATH) return path.resolve(env.OPENCODE_DB_PATH)
  return path.join(getOpenCodeRoot(env, homedir), "opencode.db")
}

export function getSessionDiffPath(
  sessionId: string,
  env: Env = process.env,
  homedir = os.homedir(),
): string {
  return path.join(getOpenCodeRoot(env, homedir), "storage", "session_diff", `${sessionId}.json`)
}

export function realpathSafe(p: string): string | null {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}

export function canonicalizePath(p: string): string {
  const resolved = path.resolve(p)
  return path.normalize(realpathSafe(resolved) ?? resolved)
}

export function fileStamp(p: string | null | undefined): string {
  if (!p) return "0"
  try {
    const st = fs.statSync(p)
    return `${st.mtimeMs}:${st.size}`
  } catch {
    return "0"
  }
}

/** DB + WAL/SHM stamps — WAL writers change companion files, not always .db mtime. */
export function dbStamp(dbPath: string): string {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].map(fileStamp).join("|")
}
