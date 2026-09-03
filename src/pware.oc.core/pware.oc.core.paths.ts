/**
 * Resolve OpenCode data paths (XDG + Windows + OPENCODE_DB_PATH).
 * Zero deps — node:fs / path / os only.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type Env = Record<string, string | undefined>

/** Absolute path to the plugin's root directory (one level above `src/`). */
export function pluginRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
}

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

/** Local agentize DB path relative to a project root, or null when absent. */
export function localAgentizeDbPath(projectRoot: string): string | null {
  const p = path.join(projectRoot, ".agentize", "opencode", "opencode.db")
  return fs.existsSync(p) ? p : null
}

/**
 * Resolve the opencode.db path — mirrors opencode's own resolution
 * (`packages/opencode/src/storage/db.ts`): `OPENCODE_DB` first, then the
 * XDG / home-based global path. agentize pins the exact DB with
 * `OPENCODE_DB` (an absolute path), so it must win over the heuristics.
 *
 * Priority:
 *   1. OPENCODE_DB env var (absolute → verbatim; relative → under the data dir)
 *   2. OPENCODE_DB_PATH env var (legacy alias)
 *   3. .agentize/opencode/opencode.db under projectRoot (when supplied)
 *   4. XDG / home-based global path
 */
export function getOpenCodeDbPath(
  env: Env = process.env,
  homedir = os.homedir(),
  projectRoot?: string | null,
): string {
  const db = env.OPENCODE_DB
  if (db && db !== ":memory:") {
    return path.isAbsolute(db)
      ? path.resolve(db)
      : path.join(getOpenCodeRoot(env, homedir), db)
  }
  if (env.OPENCODE_DB_PATH) return path.resolve(env.OPENCODE_DB_PATH)
  if (projectRoot) {
    const local = localAgentizeDbPath(projectRoot)
    if (local) return local
  }
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

/** Trimmed non-empty string, else null. */
export function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim()
  return null
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

/**
 * Fold an absolute path/directory into one comparison key so two spellings of
 * the same location compare equal: posix separators (`D:/` and `D:\`), a
 * git-bash drive prefix (`/d/…`), trailing slashes, and drive-letter case
 * (`d:/` from git-bash vs `D:/`). Path case is folded only on Windows, where
 * the filesystem is case-insensitive.
 */
export function foldPathKey(p: string | null | undefined): string {
  if (!p) return ""
  let t = normalizeIncomingPath(p).replace(/\/+$/, "")
  const drive = t.match(/^([a-z]):\//)
  if (drive) t = `${drive[1]!.toUpperCase()}:${t.slice(2)}`
  return process.platform === "win32" ? t.toLowerCase() : t
}

/** True when two directory/file paths point at the same location. */
export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  return foldPathKey(a) === foldPathKey(b)
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

/** Read a JSON file as a plain object, soft-failing to null (missing / invalid / non-object). */
export function readJson(p: string): Record<string, unknown> | null {
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
