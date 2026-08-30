/**
 * Read-only git status for Files letters. No repo / no git → empty, never throws.
 * Status is scoped to the listed paths — never the whole worktree.
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileStamp } from "./paths.js"

/** Porcelain XY letters only. `?` is untracked. Do not invent extras here. */
export type GitLetter = "M" | "A" | "D" | "R" | "C" | "U" | "T" | "?"

const GIT_PATH_CAP = 40
const GIT_DEBOUNCE_MS = 2500

export function findGitRoot(start?: string | null): string | null {
  if (!start) return null
  let dir = path.resolve(start)
  for (let i = 0; i < 16; i++) {
    try {
      if (fs.existsSync(path.join(dir, ".git"))) return dir
    } catch {
      return null
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function gitStatusStamp(projectRoot?: string | null): string {
  const root = findGitRoot(projectRoot)
  if (!root) return "0"
  return [fileStamp(path.join(root, ".git")), fileStamp(path.join(root, ".git", "HEAD")), fileStamp(path.join(root, ".git", "index"))].join("|")
}

function porcelainLetter(xy: string): GitLetter | null {
  if (xy === "??") return "?"
  if (xy === "!!") return null
  const x = xy[0] ?? " "
  const y = xy[1] ?? " "
  if (x === "U" || y === "U" || xy === "AA" || xy === "DD") return "U"
  const rank = (c: string): GitLetter | null => {
    if (c === "D") return "D"
    if (c === "R") return "R"
    if (c === "C") return "C"
    if (c === "A") return "A"
    if (c === "T") return "T"
    if (c === "M") return "M"
    return null
  }
  return rank(x) ?? rank(y)
}

function parsePorcelainZ(buf: string): Map<string, GitLetter> {
  const out = new Map<string, GitLetter>()
  let i = 0
  while (i < buf.length) {
    const xy = buf.slice(i, i + 2)
    if (xy.length < 2) break
    i += 2
    if (buf[i] === " ") i += 1
    const z = buf.indexOf("\0", i)
    if (z < 0) break
    const p1 = buf.slice(i, z).replace(/\\/g, "/")
    i = z + 1
    if (xIsRename(xy[0] ?? "")) {
      const z2 = buf.indexOf("\0", i)
      if (z2 >= 0) i = z2 + 1
    }
    const letter = porcelainLetter(xy)
    if (letter && p1) out.set(p1.toLowerCase(), letter)
  }
  return out
}

function xIsRename(x: string): boolean {
  return x === "R" || x === "C"
}

export function relToGitRoot(posixPath: string, root: string): string {
  const file = posixPath.replace(/\\/g, "/")
  const base = root.replace(/\\/g, "/").replace(/\/+$/, "")
  const lower = file.toLowerCase()
  const rootLower = base.toLowerCase()
  if (lower.startsWith(`${rootLower}/`)) return lower.slice(rootLower.length + 1)
  return lower.replace(/^\.\//, "")
}

function relsFrom(posixPaths: string[], root: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of posixPaths) {
    const rel = relToGitRoot(p, root)
    if (!rel || seen.has(rel)) continue
    seen.add(rel)
    out.push(rel)
    if (out.length >= GIT_PATH_CAP) break
  }
  return out
}

let cacheKey = ""
let cacheMarks = new Map<string, GitLetter>()
let cacheRoot: string | null = null
let lastPathKey = ""
let lastSpawn = 0

/** Porcelain letters for the given files only. Debounced on index stamp noise. */
export function readGitMarksFor(
  posixPaths: string[],
  projectRoot?: string | null,
): {
  root: string | null
  marks: Map<string, GitLetter>
} {
  const root = findGitRoot(projectRoot)
  if (!root || posixPaths.length === 0) {
    return { root, marks: new Map() }
  }
  const rels = relsFrom(posixPaths, root)
  const pathKey = rels.slice().sort().join("\0")
  const stamp = gitStatusStamp(projectRoot)
  const key = `${root}|${stamp}|${pathKey}`
  if (key === cacheKey) return { root: cacheRoot, marks: cacheMarks }

  const now = Date.now()
  if (pathKey === lastPathKey && lastSpawn > 0 && now - lastSpawn < GIT_DEBOUNCE_MS) {
    return { root: cacheRoot, marks: cacheMarks }
  }

  cacheRoot = root
  cacheMarks = new Map()
  cacheKey = key
  lastPathKey = pathKey
  lastSpawn = now
  try {
    const res = spawnSync(
      "git",
      ["-c", "core.quotepath=false", "status", "--porcelain", "-z", "--", ...rels],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 1500,
        windowsHide: true,
      },
    )
    if (res.status === 0 && res.stdout) cacheMarks = parsePorcelainZ(res.stdout)
  } catch {
    cacheMarks = new Map()
  }
  return { root, marks: cacheMarks }
}

export function gitLetterFor(posixPath: string, projectRoot?: string | null): GitLetter | null {
  const { root, marks } = readGitMarksFor([posixPath], projectRoot)
  if (!root || marks.size === 0) return null
  const rel = relToGitRoot(posixPath, root)
  return marks.get(rel) ?? marks.get(posixPath.replace(/\\/g, "/").toLowerCase()) ?? null
}
