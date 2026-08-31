import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { debugLogDir, dbg, resetDebug } from "../../src/debug.js"

describe("debugLogDir", () => {
  test("returns null when env var absent", () => {
    expect(debugLogDir({})).toBeNull()
  })
  test("returns null for falsy values", () => {
    expect(debugLogDir({ OES_DEBUG_OPENCODE: "0" })).toBeNull()
    expect(debugLogDir({ OES_DEBUG_OPENCODE: "false" })).toBeNull()
    expect(debugLogDir({ OES_DEBUG_OPENCODE: "no" })).toBeNull()
    expect(debugLogDir({ OES_DEBUG_OPENCODE: "off" })).toBeNull()
  })
  test("returns the provided defaultDir for truthy shorthand", () => {
    const fallback = path.join(os.tmpdir(), "oes-test-default")
    expect(debugLogDir({ OES_DEBUG_OPENCODE: "1" }, fallback)).toBe(fallback)
    expect(debugLogDir({ OES_DEBUG_OPENCODE: "true" }, fallback)).toBe(fallback)
    expect(debugLogDir({ OES_DEBUG_OPENCODE: "yes" }, fallback)).toBe(fallback)
  })
  test("returns a path ending with 'logs' when no defaultDir and truthy shorthand", () => {
    const result = debugLogDir({ OES_DEBUG_OPENCODE: "1" })
    expect(result?.endsWith("logs") || result?.endsWith("logs\\") || result?.endsWith("logs/")).toBe(true)
  })
  test("returns the value when it looks like a path", () => {
    expect(debugLogDir({ OES_DEBUG_OPENCODE: "/var/log/oes" })).toBe("/var/log/oes")
    expect(debugLogDir({ OES_DEBUG_OPENCODE: "D:\\logs\\oes" })).toBe("D:\\logs\\oes")
  })
})

describe("dbg", () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oes-debug-test-"))
    process.env.OES_DEBUG_OPENCODE = tmp
    resetDebug()
  })

  afterEach(() => {
    delete process.env.OES_DEBUG_OPENCODE
    resetDebug()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test("writes a JSON line to the log file", () => {
    dbg("test", "hello", { x: 1 })
    const files = fs.readdirSync(tmp)
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/^oes-debug-\d{4}-\d{2}-\d{2}\.log$/)
    const line = JSON.parse(fs.readFileSync(path.join(tmp, files[0]!), "utf8").trim())
    expect(line.tag).toBe("test")
    expect(line.msg).toBe("hello")
    expect(line.data).toEqual({ x: 1 })
    expect(typeof line.ts).toBe("string")
  })

  test("omits data field when not provided", () => {
    dbg("test", "no-data")
    const files = fs.readdirSync(tmp)
    const line = JSON.parse(fs.readFileSync(path.join(tmp, files[0]!), "utf8").trim())
    expect("data" in line).toBe(false)
  })

  test("appends multiple lines", () => {
    dbg("a", "first")
    dbg("b", "second")
    const files = fs.readdirSync(tmp)
    const lines = fs.readFileSync(path.join(tmp, files[0]!), "utf8").trim().split("\n")
    expect(lines.length).toBe(2)
  })

  test("silent when env var unset", () => {
    delete process.env.OES_DEBUG_OPENCODE
    resetDebug()
    dbg("test", "should not write")
    // no file created in tmp (different dir — nothing to check)
    // just ensure no throw
  })
})
