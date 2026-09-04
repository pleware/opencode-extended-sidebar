import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  getDataDir,
  getOpenCodeConfigDir,
  getOpenCodeDbPath,
  getOpenCodeRoot,
  getSessionDiffPath,
  localAgentizeDbPath,
  pluginRoot,
  foldPathKey,
  samePath,
  realpathSafe,
  basenameOf,
  finiteNum,
  str,
  canonicalizePath,
  resolveProjectFile,
  relativeProjectPath,
  readJson,
  fileStamp,
  dbStamp,
} from "../../../src/pware.oc.core/pware.oc.core.paths.js"

// ── getDataDir ──────────────────────────────────────────────────────────────

describe("getDataDir", () => {
  test("returns ~/.local/share when XDG_DATA_HOME is unset", () => {
    const h = "/home/user"
    expect(getDataDir({}, h)).toBe(path.join(h, ".local", "share"))
  })

  test("expands ~/ prefix in XDG_DATA_HOME", () => {
    const h = "/home/user"
    expect(getDataDir({ XDG_DATA_HOME: "~/data" }, h)).toBe(path.join(h, "data"))
  })

  test("uses XDG_DATA_HOME verbatim when no ~ prefix", () => {
    expect(getDataDir({ XDG_DATA_HOME: "/custom/data" }, "/home/user")).toBe("/custom/data")
  })

  test("expands a bare ~ to the homedir", () => {
    const h = "/home/user"
    expect(getDataDir({ XDG_DATA_HOME: "~" }, h)).toBe(h)
  })

  test("expands a ~\\ backslash prefix", () => {
    const h = "/home/user"
    expect(getDataDir({ XDG_DATA_HOME: "~\\data" }, h)).toBe(path.join(h, "data"))
  })
})

describe("pluginRoot", () => {
  test("resolves to the repo root, not src", () => {
    const base = path.basename(pluginRoot()).toLowerCase()
    expect(base).toBe("opencode-extended-sidebar")
  })
})

// ── localAgentizeDbPath ─────────────────────────────────────────────────────

describe("localAgentizeDbPath", () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oes-paths-"))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test("returns null when .agentize/opencode/opencode.db absent", () => {
    expect(localAgentizeDbPath(tmp)).toBeNull()
  })

  test("returns path when .agentize/opencode/opencode.db exists", () => {
    const dir = path.join(tmp, ".agentize", "opencode")
    const db = path.join(dir, "opencode.db")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(db, "")
    expect(localAgentizeDbPath(tmp)).toBe(db)
  })
})

// ── getOpenCodeDbPath ───────────────────────────────────────────────────────

describe("getOpenCodeDbPath", () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oes-paths-"))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test("OPENCODE_DB (absolute) wins over everything, like opencode itself", () => {
    const explicit = path.join(tmp, "agentize.db")
    const result = getOpenCodeDbPath({ OPENCODE_DB: explicit }, "/home/x", tmp)
    expect(result).toBe(path.resolve(explicit))
  })

  test("relative OPENCODE_DB is joined onto the data dir", () => {
    const h = "/home/testuser"
    const result = getOpenCodeDbPath({ OPENCODE_DB: "custom.db" }, h, null)
    expect(result).toBe(path.join(h, ".local", "share", "opencode", "custom.db"))
  })

  test("OPENCODE_DB :memory: falls through to file heuristics", () => {
    // opencode uses an in-memory DB — the plugin needs a file, so it degrades
    // to the global path instead of returning a non-file value.
    const h = "/home/testuser"
    const result = getOpenCodeDbPath({ OPENCODE_DB: ":memory:" }, h, null)
    expect(result).toBe(path.join(h, ".local", "share", "opencode", "opencode.db"))
  })

  test("OPENCODE_DB_PATH is a legacy alias, used when OPENCODE_DB is absent", () => {
    const explicit = path.join(tmp, "custom.db")
    const result = getOpenCodeDbPath({ OPENCODE_DB_PATH: explicit }, "/home/x", tmp)
    expect(result).toBe(path.resolve(explicit))
  })

  test("returns local .agentize db when present under projectRoot", () => {
    const dir = path.join(tmp, ".agentize", "opencode")
    const db = path.join(dir, "opencode.db")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(db, "")
    expect(getOpenCodeDbPath({}, "/home/x", tmp)).toBe(db)
  })

  test("falls back to global path when projectRoot has no local db", () => {
    const h = "/home/testuser"
    // tmp has no .agentize dir → falls through to global
    const result = getOpenCodeDbPath({}, h, tmp)
    expect(result).toBe(path.join(h, ".local", "share", "opencode", "opencode.db"))
  })

  test("falls back to global path when no projectRoot given", () => {
    const h = "/home/testuser"
    const result = getOpenCodeDbPath({}, h, null)
    expect(result).toBe(path.join(h, ".local", "share", "opencode", "opencode.db"))
  })

  test("projectRoot takes priority over cwd", () => {
    // create local db ONLY under projectRoot, not cwd
    const pr = path.join(tmp, "project")
    fs.mkdirSync(pr)
    const dir = path.join(pr, ".agentize", "opencode")
    const db = path.join(dir, "opencode.db")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(db, "")
    expect(getOpenCodeDbPath({}, "/home/x", pr)).toBe(db)
  })
})

// ── foldPathKey / samePath ──────────────────────────────────────────────────

describe("foldPathKey / samePath", () => {
  test("D:/ and D:\\ spellings of one directory compare equal", () => {
    expect(samePath("D:/proj/src", "D:\\proj\\src")).toBe(true)
    expect(samePath("D:/proj", "D:/proj")).toBe(true)
  })

  test("a git-bash /d/ prefix is the same location as D:/", () => {
    expect(samePath("/d/proj/src", "D:/proj/src")).toBe(true)
  })

  test("trailing slashes do not split one directory", () => {
    expect(samePath("D:/proj/src/", "D:/proj/src")).toBe(true)
  })

  test("different paths stay different", () => {
    expect(samePath("D:/proj/src", "D:/proj/lib")).toBe(false)
    expect(samePath("D:/proj", "C:/proj")).toBe(false)
  })

  test("null or empty is only equal to null or empty", () => {
    expect(samePath(null, null)).toBe(true)
    expect(samePath("", undefined)).toBe(true)
    expect(samePath("D:/proj", null)).toBe(false)
  })

  test("on Windows the key folds case; elsewhere it keeps it", () => {
    const win = process.platform === "win32"
    if (win) {
      expect(foldPathKey("D:/Proj/README.md")).toBe("d:/proj/readme.md")
    } else {
      expect(foldPathKey("D:/Proj/README.md")).toBe("D:/Proj/README.md")
    }
  })
})

// ── getOpenCodeConfigDir ────────────────────────────────────────────────────

describe("getOpenCodeConfigDir", () => {
  test("falls back to ~/.config/opencode when XDG_CONFIG_HOME is unset", () => {
    const h = "/home/user"
    expect(getOpenCodeConfigDir({}, h)).toBe(path.join(h, ".config", "opencode"))
  })

  test("expands a bare ~ to the homedir", () => {
    const h = "/home/user"
    expect(getOpenCodeConfigDir({ XDG_CONFIG_HOME: "~" }, h)).toBe(path.join(h, "opencode"))
  })

  test("expands ~/ and ~\\ prefixes", () => {
    const h = "/home/user"
    expect(getOpenCodeConfigDir({ XDG_CONFIG_HOME: "~/cfg" }, h)).toBe(path.join(h, "cfg", "opencode"))
    expect(getOpenCodeConfigDir({ XDG_CONFIG_HOME: "~\\cfg" }, h)).toBe(path.join(h, "cfg", "opencode"))
  })

  test("uses XDG_CONFIG_HOME verbatim when there is no ~ prefix", () => {
    expect(getOpenCodeConfigDir({ XDG_CONFIG_HOME: "/abs/cfg" }, "/home/user")).toBe(
      path.join("/abs/cfg", "opencode"),
    )
  })
})

// ── getOpenCodeRoot ─────────────────────────────────────────────────────────

describe("getOpenCodeRoot", () => {
  test("joins opencode onto the data dir", () => {
    const h = "/home/user"
    expect(getOpenCodeRoot({}, h)).toBe(path.join(h, ".local", "share", "opencode"))
  })
})

// ── getSessionDiffPath ──────────────────────────────────────────────────────

describe("getSessionDiffPath", () => {
  test("builds storage/session_diff/<id>.json under the opencode root", () => {
    const h = "/home/user"
    expect(getSessionDiffPath("abc123", {}, h)).toBe(
      path.join(h, ".local", "share", "opencode", "storage", "session_diff", "abc123.json"),
    )
  })
})

// ── realpathSafe / canonicalizePath ─────────────────────────────────────────

describe("realpathSafe", () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oes-paths-"))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test("returns the real path for an existing file", () => {
    const f = path.join(tmp, "real.txt")
    fs.writeFileSync(f, "")
    expect(realpathSafe(f)).toBe(fs.realpathSync(f))
  })

  test("returns null for a missing path", () => {
    expect(realpathSafe(path.join(tmp, "nope.txt"))).toBeNull()
  })
})

describe("canonicalizePath", () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oes-paths-"))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test("resolves to the real path for an existing file", () => {
    const f = path.join(tmp, "canon.txt")
    fs.writeFileSync(f, "")
    expect(canonicalizePath(f)).toBe(fs.realpathSync(f))
  })

  test("normalizes the resolved path when the file is missing", () => {
    const missing = path.join(tmp, "no", "such", "file.txt")
    expect(canonicalizePath(missing)).toBe(path.normalize(path.resolve(missing)))
  })
})

// ── basenameOf / finiteNum / str ────────────────────────────────────────────

describe("basenameOf", () => {
  test("returns the last path segment", () => {
    expect(basenameOf("foo/bar.txt")).toBe("bar.txt")
    expect(basenameOf("foo/bar")).toBe("bar")
    expect(basenameOf("bar")).toBe("bar")
  })

  test("strips trailing slashes", () => {
    expect(basenameOf("foo/bar.txt/")).toBe("bar.txt")
    expect(basenameOf("foo/")).toBe("foo")
  })

  test("treats backslashes as separators", () => {
    expect(basenameOf("foo\\bar\\baz")).toBe("baz")
  })

  test("returns file for empty or separator-only inputs", () => {
    expect(basenameOf("")).toBe("file")
    expect(basenameOf("   ")).toBe("file")
    expect(basenameOf("/")).toBe("file")
    expect(basenameOf("///")).toBe("file")
  })
})

describe("finiteNum", () => {
  test("keeps positive finite numbers", () => {
    expect(finiteNum(5)).toBe(5)
    expect(finiteNum(1.5)).toBe(1.5)
  })

  test("returns 0 for zero, negatives, non-finite, or non-numbers", () => {
    expect(finiteNum(0)).toBe(0)
    expect(finiteNum(-1)).toBe(0)
    expect(finiteNum(Infinity)).toBe(0)
    expect(finiteNum(NaN)).toBe(0)
    expect(finiteNum("5")).toBe(0)
    expect(finiteNum(null)).toBe(0)
    expect(finiteNum(undefined)).toBe(0)
  })
})

describe("str", () => {
  test("trims non-empty strings", () => {
    expect(str("  hello  ")).toBe("hello")
  })

  test("returns null for empty, whitespace, or non-strings", () => {
    expect(str("")).toBeNull()
    expect(str("   ")).toBeNull()
    expect(str(123)).toBeNull()
    expect(str(null)).toBeNull()
    expect(str(undefined)).toBeNull()
  })
})

// ── resolveProjectFile / relativeProjectPath ────────────────────────────────

describe("resolveProjectFile / relativeProjectPath", () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oes-paths-"))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test("returns null for a missing filePath", () => {
    expect(resolveProjectFile(tmp, null)).toBeNull()
    expect(resolveProjectFile(tmp, undefined)).toBeNull()
    expect(resolveProjectFile(tmp, "")).toBeNull()
  })

  test("returns null when no roots are supplied", () => {
    expect(resolveProjectFile(null, "x")).toBeNull()
    expect(resolveProjectFile(undefined, "x")).toBeNull()
    expect(resolveProjectFile([], "x")).toBeNull()
  })

  test("resolves a relative file inside the root", () => {
    const dir = path.join(tmp, "src")
    const f = path.join(dir, "app.ts")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(f, "")
    const hit = resolveProjectFile(tmp, "src/app.ts")
    expect(hit?.rel).toBe("src/app.ts")
    expect(hit?.abs).toBe(fs.realpathSync(f))
  })

  test("resolves an absolute file inside the root", () => {
    const f = path.join(tmp, "abs.ts")
    fs.writeFileSync(f, "")
    const hit = resolveProjectFile(tmp, f)
    expect(hit?.rel).toBe("abs.ts")
    expect(hit?.abs).toBe(fs.realpathSync(f))
  })

  test("rejects a ../ escape above the root", () => {
    expect(resolveProjectFile(tmp, "../outside.txt")).toBeNull()
    expect(resolveProjectFile(tmp, "..")).toBeNull()
  })

  test("rejects a filePath equal to the root itself", () => {
    expect(resolveProjectFile(tmp, tmp)).toBeNull()
  })

  test("rejects a non-existent file inside the root", () => {
    expect(resolveProjectFile(tmp, "missing.txt")).toBeNull()
  })

  test("accepts a string root or an array of roots", () => {
    fs.writeFileSync(path.join(tmp, "one.ts"), "")
    expect(resolveProjectFile(tmp, "one.ts")?.rel).toBe("one.ts")
    expect(resolveProjectFile([tmp], "one.ts")?.rel).toBe("one.ts")
  })

  test("skips an empty-string root and resolves via a later root", () => {
    fs.writeFileSync(path.join(tmp, "one.ts"), "")
    expect(resolveProjectFile(["", tmp], "one.ts")?.rel).toBe("one.ts")
  })

  test("deduplicates identical roots", () => {
    fs.writeFileSync(path.join(tmp, "one.ts"), "")
    expect(resolveProjectFile([tmp, tmp], "one.ts")?.rel).toBe("one.ts")
  })

  test("relativeProjectPath returns the relative path or null", () => {
    const dir = path.join(tmp, "src")
    const f = path.join(dir, "app.ts")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(f, "")
    expect(relativeProjectPath(tmp, "src/app.ts")).toBe("src/app.ts")
    expect(relativeProjectPath(tmp, "../outside.txt")).toBeNull()
    expect(relativeProjectPath(null, "x")).toBeNull()
    expect(relativeProjectPath(tmp, null)).toBeNull()
  })
})

// ── readJson / fileStamp / dbStamp ──────────────────────────────────────────

describe("readJson", () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oes-paths-"))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test("returns null for a missing file", () => {
    expect(readJson(path.join(tmp, "none.json"))).toBeNull()
  })

  test("parses a valid JSON object", () => {
    const f = path.join(tmp, "ok.json")
    fs.writeFileSync(f, '{"a": 1, "b": [1, 2]}')
    expect(readJson(f)).toEqual({ a: 1, b: [1, 2] })
  })

  test("returns null for an array, scalar, or null JSON value", () => {
    const arr = path.join(tmp, "arr.json")
    fs.writeFileSync(arr, "[1, 2, 3]")
    expect(readJson(arr)).toBeNull()

    const num = path.join(tmp, "num.json")
    fs.writeFileSync(num, "42")
    expect(readJson(num)).toBeNull()

    const strf = path.join(tmp, "str.json")
    fs.writeFileSync(strf, '"hello"')
    expect(readJson(strf)).toBeNull()

    const nul = path.join(tmp, "nul.json")
    fs.writeFileSync(nul, "null")
    expect(readJson(nul)).toBeNull()
  })

  test("returns null for invalid JSON", () => {
    const f = path.join(tmp, "bad.json")
    fs.writeFileSync(f, "{not json")
    expect(readJson(f)).toBeNull()
  })
})

describe("fileStamp / dbStamp", () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oes-paths-"))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test("returns 0 for a missing, empty, or null path", () => {
    expect(fileStamp(null)).toBe("0")
    expect(fileStamp(undefined)).toBe("0")
    expect(fileStamp("")).toBe("0")
    expect(fileStamp(path.join(tmp, "missing.db"))).toBe("0")
  })

  test("returns mtime:size for an existing file", () => {
    const f = path.join(tmp, "x.db")
    fs.writeFileSync(f, "hello")
    const st = fs.statSync(f)
    expect(fileStamp(f)).toBe(`${st.mtimeMs}:${st.size}`)
  })

  test("dbStamp joins the db + wal + shm stamps", () => {
    const db = path.join(tmp, "real.db")
    fs.writeFileSync(db, "data")
    const st = fs.statSync(db)
    expect(dbStamp(db)).toBe(`${st.mtimeMs}:${st.size}|0|0`)
  })
})
