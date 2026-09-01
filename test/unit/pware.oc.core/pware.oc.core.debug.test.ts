import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { dbg, debugActive, debugActiveDir, debugLogDir, profile, profileActive, profileActiveDir, profileAsync, profileLogDir, readProfileStats, resetDebug, writeProfileSummary } from "../../../src/pware.oc.core/pware.oc.core.debug.js"

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

describe("profileLogDir", () => {
  test("returns null when env var absent", () => {
    expect(profileLogDir({})).toBeNull()
  })
  test("returns null for falsy values", () => {
    expect(profileLogDir({ OES_DEBUG_PROFILE: "0" })).toBeNull()
    expect(profileLogDir({ OES_DEBUG_PROFILE: "off" })).toBeNull()
  })
  test("returns the provided defaultDir for truthy shorthand", () => {
    const fallback = path.join(os.tmpdir(), "oes-test-profile-default")
    expect(profileLogDir({ OES_DEBUG_PROFILE: "1" }, fallback)).toBe(fallback)
    expect(profileLogDir({ OES_DEBUG_PROFILE: "on" }, fallback)).toBe(fallback)
  })
  test("returns the value when it looks like a path", () => {
    expect(profileLogDir({ OES_DEBUG_PROFILE: "/var/log/oes-profile" })).toBe("/var/log/oes-profile")
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

describe("profile", () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oes-profile-test-"))
    process.env.OES_DEBUG_PROFILE = tmp
    resetDebug()
  })

  afterEach(() => {
    delete process.env.OES_DEBUG_PROFILE
    resetDebug()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test("writes a { tag, ms } line and returns fn's result", () => {
    const out = profile("test", () => 42, { x: 1 })
    expect(out).toBe(42)
    const files = fs.readdirSync(tmp)
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/^oes-profile-\d{4}-\d{2}-\d{2}\.log$/)
    const line = JSON.parse(fs.readFileSync(path.join(tmp, files[0]!), "utf8").trim())
    expect(line.tag).toBe("test")
    expect(typeof line.ms).toBe("number")
    expect(line.data).toEqual({ x: 1 })
    expect(typeof line.ts).toBe("string")
  })

  test("omits data field when not provided", () => {
    profile("test", () => {})
    const files = fs.readdirSync(tmp)
    const line = JSON.parse(fs.readFileSync(path.join(tmp, files[0]!), "utf8").trim())
    expect("data" in line).toBe(false)
  })

  test("silent when env var unset", () => {
    delete process.env.OES_DEBUG_PROFILE
    resetDebug()
    expect(profile("test", () => "ok")).toBe("ok")
    const files = fs.readdirSync(tmp)
    expect(files.length).toBe(0)
  })

  test("debugActive / profileActive reflect the resolved loggers", () => {
    expect(profileActive()).toBe(true) // OES_DEBUG_PROFILE → tmp
    expect(profileActiveDir()).toBe(tmp)
    delete process.env.OES_DEBUG_OPENCODE
    resetDebug()
    expect(debugActive()).toBe(false) // OES_DEBUG_OPENCODE unset
    expect(debugActiveDir()).toBeNull()
  })
})

describe("profileAsync", () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oes-profile-async-test-"))
    process.env.OES_DEBUG_PROFILE = tmp
    resetDebug()
  })

  afterEach(() => {
    delete process.env.OES_DEBUG_PROFILE
    resetDebug()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test("resolves fn's value and writes a line", async () => {
    const out = await profileAsync("rpc.test", async () => "done")
    expect(out).toBe("done")
    const files = fs.readdirSync(tmp)
    expect(files.length).toBe(1)
    const line = JSON.parse(fs.readFileSync(path.join(tmp, files[0]!), "utf8").trim())
    expect(line.tag).toBe("rpc.test")
    expect(typeof line.ms).toBe("number")
  })

  test("propagates rejection but still writes", async () => {
    await expect(profileAsync("rpc.err", async () => {
      throw new Error("boom")
    })).rejects.toThrow("boom")
    const files = fs.readdirSync(tmp)
    const line = JSON.parse(fs.readFileSync(path.join(tmp, files[0]!), "utf8").trim())
    expect(line.tag).toBe("rpc.err")
  })
})

describe("profile aggregation", () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oes-profile-agg-test-"))
    process.env.OES_DEBUG_PROFILE = tmp
    resetDebug()
  })

  afterEach(() => {
    delete process.env.OES_DEBUG_PROFILE
    resetDebug()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test("readProfileStats accumulates n/sum/max per tag", () => {
    profile("a", () => {})
    profile("a", () => {})
    profile("b", () => {})
    const stats = readProfileStats()
    expect(stats.a?.n).toBe(2)
    expect(stats.b?.n).toBe(1)
    expect(stats.a?.sum).toBeGreaterThanOrEqual(0)
    expect(stats.a?.max).toBeGreaterThanOrEqual(0)
    expect(stats.c).toBeUndefined()
  })

  test("writeProfileSummary appends one summary line", () => {
    profile("a", () => {})
    writeProfileSummary()
    const files = fs.readdirSync(tmp)
    const lines = fs.readFileSync(path.join(tmp, files[0]!), "utf8").trim().split("\n")
    const last = JSON.parse(lines[lines.length - 1]!)
    expect(last.tag).toBe("summary")
    const data = last.data as Record<string, { n: number; total: number; avg: number; max: number }>
    expect(data.a?.n).toBe(1)
    expect(typeof data.a?.total).toBe("number")
    expect(typeof data.a?.avg).toBe("number")
    expect(typeof data.a?.max).toBe("number")
  })

  test("stats are empty when profiling is off", () => {
    delete process.env.OES_DEBUG_PROFILE
    resetDebug()
    profile("a", () => {})
    expect(readProfileStats()).toEqual({})
  })
})
