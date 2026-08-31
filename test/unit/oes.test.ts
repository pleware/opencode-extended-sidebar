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
  test("skipGitignore replaces the flag; missing keeps the base", () => {
    expect(pick({ skipGitignore: true }, OES_DEFAULTS).skipGitignore).toBe(true)
    expect(pick({ skipGitignore: false }, OES_DEFAULTS).skipGitignore).toBe(false)
    expect(pick({ fileRows: 5 }, OES_DEFAULTS).skipGitignore).toBe(OES_DEFAULTS.skipGitignore)
  })
  test("null raw returns the base", () => {
    expect(pick(null, OES_DEFAULTS)).toBe(OES_DEFAULTS)
  })
  test("omoRows clamps to 0..20; 0 keeps the OMO group collapsed", () => {
    expect(pick({ omoRows: 99 }, OES_DEFAULTS).omoRows).toBe(20)
    expect(pick({ omoRows: 0 }, OES_DEFAULTS).omoRows).toBe(0)
    expect(pick({ omoRows: -5 }, OES_DEFAULTS).omoRows).toBe(0)
    expect(pick({ omoRows: "nope" } as Record<string, unknown>, OES_DEFAULTS).omoRows).toBe(
      OES_DEFAULTS.omoRows,
    )
  })
})
