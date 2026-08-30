import { describe, expect, test } from "bun:test"
import { OES_DEFAULTS, pick } from "../../src/oes.js"

describe("pick", () => {
  test("clamps numeric ranges", () => {
    const hi = pick({ fileRows: 99, lineMax: 9, perfTurns: 1, sessionRows: 99 }, OES_DEFAULTS)
    expect(hi.fileRows).toBe(20)
    expect(hi.lineMax).toBe(20)
    expect(hi.perfTurns).toBe(20)
    expect(hi.sessionRows).toBe(12)
    const lo = pick({ fileRows: 1, perfHistory: -2 }, OES_DEFAULTS)
    expect(lo.fileRows).toBe(3)
    expect(lo.perfHistory).toBe(0)
  })
  test("invalid numbers fall back", () => {
    const next = pick({ fileRows: "nope", toolRows: Number.NaN } as Record<string, unknown>, OES_DEFAULTS)
    expect(next.fileRows).toBe(OES_DEFAULTS.fileRows)
    expect(next.toolRows).toBe(OES_DEFAULTS.toolRows)
  })
  test("skipDirs replaces, does not append; [] disables", () => {
    const replaced = pick({ skipDirs: ["docs/media"] }, OES_DEFAULTS)
    expect(replaced.skipDirs).toEqual(["docs/media"])
    expect(replaced.skipDirs).not.toContain("tmp")
    const off = pick({ skipDirs: [] }, OES_DEFAULTS)
    expect(off.skipDirs).toEqual([])
  })
  test("null raw returns the base", () => {
    expect(pick(null, OES_DEFAULTS)).toBe(OES_DEFAULTS)
  })
})
