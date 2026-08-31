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

/** Last path segment. Never a directory. */
export function basenameOf(p: string): string {
  const t = p.replace(/\\/g, "/").replace(/\/+$/, "").trim()
  if (!t) return "file"
  const i = t.lastIndexOf("/")
  const base = i >= 0 ? t.slice(i + 1) : t
  return base || "file"
}

/** Positive finite number, else 0. */
export function finiteNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0
}

export function canonicalizePath(p: string): string {
  const resolved = path.resolve(p)
  return path.normalize(realpathSafe(resolved) ?? resolved)
}

/**
 * OpenCode/git often emit posix paths (`D:/a/b` or `/d/a/b`).
 * Fold those onto the host path so Windows `D:\` matches.
 */
export function normalizeIncomingPath(p: string): string {
  let t = p.trim().replace(/\\/g, "/")
  const m = t.match(/^\/([A-Za-z])\/(.*)$/)
  if (m) t = `${m[1]}:/${m[2]}`
  return t
}

function isInsideRoot(root: string, abs: string): boolean {
  const rel = path.relative(root, abs)
  if (!rel || path.isAbsolute(rel)) return false
  const n = rel.replace(/\\/g, "/")
  if (n === ".." || n.startsWith("../")) return false
  return true
}

function asRootList(roots: string | readonly string[] | null | undefined): string[] {
  if (!roots) return []
  const list = typeof roots === "string" ? [roots] : [...roots]
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of list) {
    if (!r || typeof r !== "string") continue
    let key = r
    try {
      key = canonicalizePath(r)
    } catch {
      key = r
    }
    const fold = process.platform === "win32" ? key.toLowerCase() : key
    if (seen.has(fold)) continue
    seen.add(fold)
    out.push(r)
  }
  return out
}

/** Absolute path + project-relative posix path, or null if outside / missing. */
export function resolveProjectFile(
  roots: string | readonly string[] | null | undefined,
  filePath: string | null | undefined,
): { abs: string; rel: string } | null {
  if (!filePath) return null
  const incoming = normalizeIncomingPath(filePath)
  for (const rawRoot of asRootList(roots)) {
    try {
      const root = canonicalizePath(rawRoot)
      const abs = path.isAbsolute(incoming)
        ? canonicalizePath(incoming)
        : canonicalizePath(path.join(root, incoming))
      if (!isInsideRoot(root, abs)) continue
      if (!fs.existsSync(abs)) continue
      const rel = path.relative(root, abs).replace(/\\/g, "/")
      if (!rel) continue
      return { abs, rel }
    } catch {
      // next root
    }
  }
  return null
}

/** Project-relative path for detail dialogs — never escapes above project root. */
export function relativeProjectPath(
  projectRoot: string | null | undefined,
  filePath: string | null | undefined,
): string | null {
  return resolveProjectFile(projectRoot, filePath)?.rel ?? null
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
