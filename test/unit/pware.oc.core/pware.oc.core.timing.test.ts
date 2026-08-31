import { describe, expect, test } from "bun:test"
import {
  BLINK_TICKS,
  EVENT_SCAN_DEBOUNCE_MS,
  FPS_READ_EVERY_TICKS,
  MONITOR_POLL_MS,
  MONITOR_WATCH_DEBOUNCE_MS,
  NOW_MS,
  TICK_MS,
} from "../../../src/pware.oc.core/pware.oc.core.timing.js"

describe("pware.oc.core.timing", () => {
  test("clock constants are sane", () => {
    expect(TICK_MS).toBeGreaterThan(0)
    expect(NOW_MS).toBeGreaterThan(TICK_MS) // rows re-render less often than glyphs
    expect(FPS_READ_EVERY_TICKS).toBeGreaterThan(0)
    expect(BLINK_TICKS).toBeGreaterThan(0)
  })

  test("scan debounce is tighter than the poll", () => {
    expect(EVENT_SCAN_DEBOUNCE_MS).toBeGreaterThan(0)
    expect(EVENT_SCAN_DEBOUNCE_MS).toBeLessThan(MONITOR_POLL_MS)
    expect(MONITOR_WATCH_DEBOUNCE_MS).toBeLessThan(MONITOR_POLL_MS)
  })
})
