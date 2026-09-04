import { describe, expect, test } from "bun:test"
import {
  isRunningLifecycle,
  normalizeStatus,
  oesBarParts,
  sessionStatusLabel,
  statusBarLine,
  tabStatus,
  tabStatusLine,
  taskRank,
  toToolStatus,
  toWorkLabel,
  workIsTerminal,
  workStatusGlyph,
  TAB_STATUS_SESSION_NOT_IN_DB,
} from "../../../src/pware.oc.core/pware.oc.core.status.js"
import type { CanonicalStatus } from "../../../src/pware.oc.core/pware.oc.core.status.js"

describe("normalizeStatus synonyms", () => {
  const rows: Array<[string | null | undefined, CanonicalStatus]> = [
    [null, "unknown"],
    ["", "unknown"],
    ["running", "running"],
    ["in_progress", "running"],
    ["active", "running"],
    ["IN_PROGRESS", "running"],
    ["pending", "pending"],
    ["queued", "pending"],
    ["completed", "completed"],
    ["done", "completed"],
    ["success", "completed"],
    ["error", "error"],
    ["failed", "error"],
    ["paused", "paused"],
    ["abandoned", "abandoned"],
    ["archived", "archived"],
    ["idle", "idle"],
    ["unknown", "unknown"],
    ["weird", "unknown"],
    ["cancelled", "unknown"],
  ]
  for (const [raw, want] of rows) {
    test(`${JSON.stringify(raw)} → ${want}`, () => {
      expect(normalizeStatus(raw)).toBe(want)
    })
  }
})

describe("mappers", () => {
  test("toToolStatus", () => {
    expect(toToolStatus("in_progress")).toBe("running")
    expect(toToolStatus("done")).toBe("completed")
    expect(toToolStatus("failed")).toBe("error")
    expect(toToolStatus("queued")).toBe("pending")
    expect(toToolStatus("paused")).toBe("pending")
    expect(toToolStatus(null)).toBe("pending")
  })
  test("toWorkLabel keeps unknown raw", () => {
    expect(toWorkLabel("completed")).toBe("done")
    expect(toWorkLabel("in_progress")).toBe("running")
    expect(toWorkLabel("failed")).toBe("error")
    expect(toWorkLabel("queued")).toBe("pending")
    expect(toWorkLabel("custom")).toBe("custom")
  })
  test("terminal and lifecycle", () => {
    expect(workIsTerminal("paused")).toBe(true)
    expect(workIsTerminal("active")).toBe(false)
    expect(isRunningLifecycle("in_progress")).toBe(true)
    expect(isRunningLifecycle("done")).toBe(false)
  })
  test("taskRank order", () => {
    expect(taskRank("running")).toBeLessThan(taskRank("queued"))
    expect(taskRank("queued")).toBeLessThan(taskRank("failed"))
    expect(taskRank("cancelled")).toBe(2)
    expect(taskRank("done")).toBe(3)
  })
})

describe("workStatusGlyph", () => {
  test("maps done / error / pending / paused / abandoned", () => {
    expect(workStatusGlyph("completed")).toBe("✓")
    expect(workStatusGlyph("failed")).toBe("×")
    expect(workStatusGlyph("in_progress")).toBeNull()
    expect(workStatusGlyph("pending")).toBe("⧗")
    expect(workStatusGlyph("queued")).toBe("⧗")
    expect(workStatusGlyph("paused")).toBe("║")
    expect(workStatusGlyph("abandoned")).toBe("⊘")
  })

  test("unknown stays a neutral circle", () => {
    expect(workStatusGlyph("unknown")).toBe("○")
  })
})

describe("sessionStatusLabel", () => {
  test("agent statuses pass through as their own display label", () => {
    expect(sessionStatusLabel("running")).toBe("running")
    expect(sessionStatusLabel("idle")).toBe("idle")
    expect(sessionStatusLabel("archived")).toBe("archived")
    expect(sessionStatusLabel("unknown")).toBe("unknown")
  })

  test("an unrecognised status stays raw", () => {
    expect(sessionStatusLabel("weird")).toBe("weird")
    expect(sessionStatusLabel("")).toBe("")
  })
})

describe("tabStatus", () => {
  const ready = {
    tab: "mywork",
    currentId: "sess-current",
    dbError: null,
    dbPresent: true,
    switching: null,
    perfError: null,
    perfTurns: 0,
    cold: false,
  }

  test("null when the tab data is ready", () => {
    expect(tabStatus(ready)).toBeNull()
  })

  test("switching wins while the target snapshot has not landed", () => {
    expect(tabStatus({ ...ready, switching: "sess-target" })).toEqual({
      label: expect.stringMatching(/^switching · /),
      tone: "loading",
    })
    expect(
      tabStatus({ ...ready, switching: "sess-target", currentId: "sess-target" }),
    ).toBeNull()
  })

  test("a fresh session row not visible yet reads as waiting", () => {
    expect(
      tabStatus({ ...ready, dbError: TAB_STATUS_SESSION_NOT_IN_DB }),
    ).toEqual({ label: "waiting for session", tone: "loading" })
  })

  test("a real db error surfaces as error tone", () => {
    expect(tabStatus({ ...ready, dbError: "db missing" })).toEqual({
      label: "db missing",
      tone: "error",
    })
  })

  test("a not-yet-loaded snapshot (no error yet) reads as waiting", () => {
    expect(tabStatus({ ...ready, dbPresent: false })).toEqual({
      label: "waiting for session",
      tone: "loading",
    })
    expect(
      tabStatus({ ...ready, dbPresent: false, dbError: "db missing" }),
    ).toEqual({ label: "db missing", tone: "error" })
  })

  test("cold tab shows its own loading label, my work and sessions differ", () => {
    expect(tabStatus({ ...ready, cold: true })).toEqual({
      label: "loading · my work",
      tone: "loading",
    })
    expect(tabStatus({ ...ready, tab: "sessions", cold: true })).toEqual({
      label: "loading · sessions",
      tone: "loading",
    })
  })

  test("perf: error, then cold, then no-turns, then ready", () => {
    const perf = { ...ready, tab: "perf" }
    expect(tabStatus({ ...perf, perfError: "db missing" })).toEqual({
      label: "db missing",
      tone: "error",
    })
    expect(tabStatus({ ...perf, cold: true })).toEqual({
      label: "loading · stats",
      tone: "loading",
    })
    expect(tabStatus(perf)).toEqual({ label: "no turns yet", tone: "muted" })
    expect(tabStatus({ ...perf, perfTurns: 3 })).toBeNull()
  })

  test("db errors outrank the perf states", () => {
    expect(
      tabStatus({ ...ready, tab: "perf", dbError: TAB_STATUS_SESSION_NOT_IN_DB }),
    ).toEqual({ label: "waiting for session", tone: "loading" })
  })
})

describe("tabStatusLine", () => {
  test("a ready tab (null) renders no row", () => {
    expect(tabStatusLine(null)).toBeNull()
  })

  test("error maps to the × glyph and keeps the label", () => {
    expect(tabStatusLine({ label: "db missing", tone: "error" })).toEqual({
      label: "db missing",
      tone: "error",
      glyph: "×",
    })
  })

  test("muted maps to the • glyph and keeps the label", () => {
    expect(tabStatusLine({ label: "no turns yet", tone: "muted" })).toEqual({
      label: "no turns yet",
      tone: "muted",
      glyph: "•",
    })
  })

  test("loading has a null glyph so the row animates the spinner", () => {
    expect(tabStatusLine({ label: "loading · my work", tone: "loading" })).toEqual({
      label: "loading · my work",
      tone: "loading",
      glyph: null,
    })
  })
})

describe("statusBarLine", () => {
  test("a ready tab yields a bare line (ready tone, no label)", () => {
    expect(statusBarLine(null)).toEqual({ label: "", tone: "ready" })
  })

  test("loading / error / muted tones pass through with their label", () => {
    expect(statusBarLine({ label: "switching · x", tone: "loading" })).toEqual({
      label: "switching · x",
      tone: "loading",
    })
    expect(statusBarLine({ label: "db missing", tone: "error" })).toEqual({
      label: "db missing",
      tone: "error",
    })
    expect(statusBarLine({ label: "no turns yet", tone: "muted" })).toEqual({
      label: "no turns yet",
      tone: "muted",
    })
  })
})

describe("oesBarParts", () => {
  test("a quiet bar splits the trend from the reading so the bar can render faded", () => {
    expect(oesBarParts("", "", "▁▃▅█", 50)).toEqual({
      head: "OES  ",
      bar: "▁▃▅█",
      rate: " 50 tok/s",
      rateIdle: false,
    })
  })

  test("a reading of zero is idle, so the row fades it with the trend", () => {
    expect(oesBarParts("", "", "    ", 0).rateIdle).toBe(true)
    expect(oesBarParts("", "", "    ", null).rateIdle).toBe(true)
  })

  test("idleness follows the printed number, so a trickle rounding to 0 fades too", () => {
    expect(oesBarParts("", "", "▁", 0.4)).toEqual({
      head: "OES  ",
      bar: "▁",
      rate: " 0 tok/s",
      rateIdle: true,
    })
    expect(oesBarParts("", "", "▁", 0.6).rateIdle).toBe(false)
  })

  test("a null rate still reads 0 tok/s rather than blanking the row", () => {
    expect(oesBarParts("", "", "", null).rate).toBe(" 0 tok/s")
  })

  test("a busy label wins — the live reading is dropped, not appended", () => {
    expect(oesBarParts("switching · x", "⠋", "▁▃▅█", 50)).toEqual({
      head: "OES ⠋ switching · x",
      bar: "",
      rate: "",
      rateIdle: false,
    })
  })

  test("with neither a label nor a reading the row is a bare OES plus its glyph", () => {
    expect(oesBarParts("", "")).toEqual({ head: "OES", bar: "", rate: "", rateIdle: false })
    expect(oesBarParts("", "×")).toEqual({ head: "OES ×", bar: "", rate: "", rateIdle: false })
  })

  test("a trend with no rate passed keeps the bar and omits the reading", () => {
    expect(oesBarParts("", "", "▁▃▅█")).toEqual({
      head: "OES  ",
      bar: "▁▃▅█",
      rate: "",
      rateIdle: true,
    })
  })
})
