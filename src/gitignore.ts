/**
 * Ignore sources for the Files panel: the project `.gitignore` (only when
 * `skipGitignore` is on) and `.oesignore` (always, when present). Both use the
 * `ignore` package for full gitignore semantics.
 */
import fs from "node:fs"
import path from "node:path"
import ignore from "ignore"
import { fileStamp } from "./paths.js"
import { createStampCache } from "./cache.js"

export function gitignorePath(projectRoot?: string | null): string | null {
  if (!projectRoot) return null
  return path.join(projectRoot, ".gitignore")
}

export function oesignorePath(projectRoot?: string | null): string | null {
  if (!projectRoot) return null
  return path.join(projectRoot, ".oesignore")
}

/** Stamp both ignore files so the fingerprint reloads when either changes. */
export function gitignoreStamp(projectRoot?: string | null): string {
  return [gitignorePath(projectRoot), oesignorePath(projectRoot)].map(fileStamp).join("|")
}

function readIfExists(p: string | null): string | null {
  if (!p) return null
  try {
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p, "utf8")
  } catch {
    return null
  }
}

/** Absolute/relative path folded to a project-relative posix path, or null. */
function toRelPath(posixFile: string, projectRoot: string): string | null {
  const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "")
  const file = posixFile.replace(/\\/g, "/").replace(/\/+$/, "")
  if (!root) return null
  if (file.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return file.slice(root.length + 1)
  if (/^[a-z]:\//i.test(file) || file.startsWith("/")) return null
  return file.replace(/^\.\//, "")
}

function compile(patterns: string | null): ReturnType<typeof ignore> {
  const ig = ignore()
  if (patterns != null) ig.add(patterns)
  return ig
}

type IgnoreSet = { gitignore: ReturnType<typeof ignore>; oesignore: ReturnType<typeof ignore> }

const ignoreCache = createStampCache<IgnoreSet>()

function setFor(projectRoot: string): IgnoreSet {
  return ignoreCache.get(`${projectRoot}|${gitignoreStamp(projectRoot)}`, () => ({
    gitignore: compile(readIfExists(gitignorePath(projectRoot))),
    oesignore: compile(readIfExists(oesignorePath(projectRoot))),
  }))
}

function ignoredBy(
  which: keyof IgnoreSet,
  posixPath: string,
  projectRoot?: string | null,
): boolean {
  if (!projectRoot) return false
  const rel = toRelPath(posixPath, projectRoot)
  if (!rel) return false
  try {
    return setFor(projectRoot)[which].ignores(rel)
  } catch {
    return false
  }
}

/** True when the path matches the project's root `.gitignore`. */
export function ignoredByGitignore(posixPath: string, projectRoot?: string | null): boolean {
  return ignoredBy("gitignore", posixPath, projectRoot)
}

/** True when the path matches the project's `.oesignore` (always on when present). */
export function ignoredByOesignore(posixPath: string, projectRoot?: string | null): boolean {
  return ignoredBy("oesignore", posixPath, projectRoot)
}
