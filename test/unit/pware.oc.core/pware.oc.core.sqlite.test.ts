import { describe, test, expect } from "bun:test"
import { isBusyError } from "../../../src/pware.oc.core/pware.oc.core.sqlite.js"

describe("isBusyError", () => {
  test("true for SQLite lock/busy messages", () => {
    expect(isBusyError(new Error("database is locked"))).toBe(true)
    expect(isBusyError(new Error("database table is locked"))).toBe(true)
    expect(isBusyError(new Error("database is busy"))).toBe(true)
    expect(isBusyError(new Error("SQLITE_BUSY: locked"))).toBe(true)
  })

  test("false for unrelated errors", () => {
    expect(isBusyError(new Error("no such table"))).toBe(false)
    expect(isBusyError(new Error("boom"))).toBe(false)
  })

  test("false for non-Error values", () => {
    expect(isBusyError(null)).toBe(false)
    expect(isBusyError(undefined)).toBe(false)
    expect(isBusyError("database is locked")).toBe(false)
    expect(isBusyError(42)).toBe(false)
    expect(isBusyError({ message: "database is locked" })).toBe(false)
  })
})
