/**
 * Root .gitignore only. Subset: comments, negation, dir-only, * / **, no nested files.
 */
import fs from "node:fs"
import path from "node:path"
import { fileStamp } from "./paths.js"
import { createStampCache } from "./cache.js"

type Rule = { neg: boolean; dirOnly: boolean; anchored: boolean; re: RegExp }

export function gitignorePath(projectRoot?: string | null): string | null {
  if (!projectRoot) return null
  return path.join(projectRoot, ".gitignore")
}

export function gitignoreStamp(projectRoot?: string | null): string {
  return fileStamp(gitignorePath(projectRoot))
}

function globToRe(glob: string): string {
  let out = ""
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] ?? ""
    const n = glob[i + 1] ?? ""
    if (c === "*" && n === "*") {
      out += ".*"
      i += 1
      continue
    }
    if (c === "*") {
      out += "[^/]*"
      continue
    }
    if (c === "?") {
      out += "[^/]"
      continue
    }
    if ("+()[]{}^$|\\.".includes(c)) out += `\\${c}`
    else out += c
  }
  return out
}

function parseLine(line: string): Rule | null {
  let s = line.replace(/\r$/, "")
  if (!s || s.startsWith("#")) return null
  let neg = false
  if (s.startsWith("\\!")) s = s.slice(1)
  else if (s.startsWith("!")) {
    neg = true
    s = s.slice(1)
  }
  s = s.trim()
  if (!s || s === "/" || s === "**") return null
  let dirOnly = s.endsWith("/")
  if (dirOnly) s = s.replace(/\/+$/, "")
  let anchored = s.startsWith("/") || s.slice(0, -1).includes("/")
  if (s.startsWith("/")) s = s.slice(1)
  if (!s) return null
  try {
    return { neg, dirOnly, anchored, re: new RegExp(`^${globToRe(s)}$`) }
  } catch {
    return null
  }
}

function loadRules(projectRoot: string): Rule[] {
  const p = gitignorePath(projectRoot)
  if (!p) return []
  try {
    return fs
      .readFileSync(p, "utf8")
      .split("\n")
      .map(parseLine)
      .filter((r): r is Rule => Boolean(r))
  } catch {
    return []
  }
}

function relToProject(posixFile: string, projectRoot: string): string | null {
  const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
  const file = posixFile.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
  if (file.startsWith(`${root}/`)) return file.slice(root.length + 1)
  if (/^[a-z]:\//.test(file) || file.startsWith("/")) return null
  return file.replace(/^\.\//, "")
}

function hits(rel: string, rule: Rule): boolean {
  const segs = rel.split("/").filter(Boolean)
  if (!segs.length) return false
  const last = segs.length - 1
  for (let i = 0; i <= last; i++) {
    const slice = segs.slice(0, i + 1).join("/")
    const name = segs[i] ?? ""
    const isFile = i === last
    if (rule.dirOnly && isFile) continue
    if (rule.anchored) {
      if (rule.re.test(slice)) return true
    } else if (rule.re.test(name) || rule.re.test(slice)) {
      return true
    }
  }
  return false
}

const ruleCache = createStampCache<Rule[]>()

function rulesFor(projectRoot: string): Rule[] {
  return ruleCache.get(`${projectRoot}|${gitignoreStamp(projectRoot)}`, () => loadRules(projectRoot))
}

/** True when the path is ignored by the project's root .gitignore. */
export function ignoredByGitignore(posixPath: string, projectRoot?: string | null): boolean {
  if (!projectRoot) return false
  const rel = relToProject(posixPath, projectRoot)
  if (!rel) return false
  let ignored = false
  for (const rule of rulesFor(projectRoot)) {
    if (hits(rel, rule)) ignored = !rule.neg
  }
  return ignored
}
