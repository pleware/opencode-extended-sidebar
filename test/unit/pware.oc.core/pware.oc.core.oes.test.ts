import { describe, expect, test } from "bun:test"
import { OES_DEFAULTS, pick } from "../../../src/pware.oc.core/pware.oc.core.oes.js"

describe("pick", () => {
  test("clamps numeric ranges", () => {
    expect(OES_DEFAULTS.sessionRows).toBe(6)
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

  test("sessionFetch is a separate fetch window, clamped to [sessionRows, 80]", () => {
    expect(OES_DEFAULTS.sessionFetch).toBe(20)
    expect(pick({ sessionRows: 6, sessionFetch: 3 }, OES_DEFAULTS).sessionFetch).toBe(6)
    expect(pick({ sessionRows: 6, sessionFetch: 999 }, OES_DEFAULTS).sessionFetch).toBe(80)
    expect(pick({ sessionFetch: "nope" } as Record<string, unknown>, OES_DEFAULTS).sessionFetch).toBe(
      OES_DEFAULTS.sessionFetch,
    )
    expect(pick({ sessionRows: 12, sessionFetch: 12 }, OES_DEFAULTS).sessionFetch).toBe(12)
    expect(pick({ sessionRows: 12 }, OES_DEFAULTS).sessionFetch).toBe(OES_DEFAULTS.sessionFetch)
  })

  test("charts.rate timing defaults and clamps", () => {
    expect(OES_DEFAULTS.charts.rate.sampleMs).toBe(55)
    expect(OES_DEFAULTS.charts.rate.windowMs).toBe(240_000)
    expect(pick({ charts: { rate: { sampleMs: 5 } } }, OES_DEFAULTS).charts.rate.sampleMs).toBe(20)
    expect(pick({ charts: { rate: { sampleMs: 5000 } } }, OES_DEFAULTS).charts.rate.sampleMs).toBe(1_000)
    expect(pick({ charts: { rate: { windowMs: 100 } } }, OES_DEFAULTS).charts.rate.windowMs).toBe(5_000)
    expect(pick({ charts: { rate: { windowMs: 999_999 } } }, OES_DEFAULTS).charts.rate.windowMs).toBe(600_000)
    expect(
      pick({ charts: { rate: { sampleMs: "nope" } } } as Record<string, unknown>, OES_DEFAULTS).charts.rate
        .sampleMs,
    ).toBe(OES_DEFAULTS.charts.rate.sampleMs)
    // Missing or malformed charts/rate falls back to defaults.
    expect(pick({}, OES_DEFAULTS).charts.rate.windowMs).toBe(240_000)
    expect(pick({ charts: "x" } as Record<string, unknown>, OES_DEFAULTS).charts.rate.windowMs).toBe(240_000)
  })
})
