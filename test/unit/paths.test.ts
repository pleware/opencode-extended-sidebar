import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  getDataDir,
  getOpenCodeDbPath,
  localAgentizeDbPath,
} from "../../src/paths.js"

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

  test("OPENCODE_DB_PATH env var wins over everything", () => {
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
