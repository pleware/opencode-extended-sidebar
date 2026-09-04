import { describe, expect, test } from "bun:test"
import { OES_DEFAULTS, pick } from "../../../src/pware.oc.core/pware.oc.core.oes.js"

describe("pick", () => {
  test("clamps numeric ranges", () => {
    const hi = pick({ fileRows: 99, lineMax: 9, perfTurns: 1 }, OES_DEFAULTS)
    expect(hi.fileRows).toBe(20)
    expect(hi.lineMax).toBe(20)
    expect(hi.perfTurns).toBe(20)
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

  test("toolFetch is a separate history window, clamped to [toolRows, 80]", () => {
    expect(OES_DEFAULTS.toolFetch).toBe(20)
    expect(pick({ toolRows: 5, toolFetch: 3 }, OES_DEFAULTS).toolFetch).toBe(5)
    expect(pick({ toolRows: 5, toolFetch: 999 }, OES_DEFAULTS).toolFetch).toBe(80)
    expect(pick({ toolFetch: "nope" } as Record<string, unknown>, OES_DEFAULTS).toolFetch).toBe(
      OES_DEFAULTS.toolFetch,
    )
    expect(pick({ toolRows: 20, toolFetch: 20 }, OES_DEFAULTS).toolFetch).toBe(20)
    expect(pick({ toolRows: 20 }, OES_DEFAULTS).toolFetch).toBe(20)
  })

  test("sessionFetch is a fetch window, clamped to [2, 80]", () => {
    expect(OES_DEFAULTS.sessionFetch).toBe(20)
    expect(pick({ sessionFetch: 1 }, OES_DEFAULTS).sessionFetch).toBe(2)
    expect(pick({ sessionFetch: 999 }, OES_DEFAULTS).sessionFetch).toBe(80)
    expect(pick({ sessionFetch: "nope" } as Record<string, unknown>, OES_DEFAULTS).sessionFetch).toBe(
      OES_DEFAULTS.sessionFetch,
    )
  })
})
