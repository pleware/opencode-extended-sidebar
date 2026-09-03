import { describe, expect, test } from "bun:test"
import {
  ENGAGE_MAX_FRAMES,
  ENGAGE_MIN_FRAMES,
  defaultBodyTone,
  directionGlyph,
  engageDone,
  engageFill,
  flowBlinkOn,
  markTone,
  spinnerFrame,
  stateGlyph,
} from "../../../src/pware.oc.core/pware.oc.core.glyph.js"

describe("spinnerFrame", () => {
  test("cycles through the braille set and wraps negatives", () => {
    expect(spinnerFrame(0)).toBe("⠋")
    expect(spinnerFrame(10)).toBe("⠋")
    expect(spinnerFrame(-1)).toBe("⠏")
  })
})

describe("flowBlinkOn", () => {
  test("blinks every other 300ms tick", () => {
    expect(flowBlinkOn(0)).toBe(true)
    expect(flowBlinkOn(1)).toBe(true)
    expect(flowBlinkOn(2)).toBe(false)
    expect(flowBlinkOn(3)).toBe(false)
    expect(flowBlinkOn(4)).toBe(true)
  })
})

describe("engageFill", () => {
  test("ramps linearly to 1 over the minimum frames and clamps", () => {
    expect(engageFill(0)).toBe(0)
    expect(engageFill(-3)).toBe(0)
    expect(engageFill(ENGAGE_MIN_FRAMES / 2)).toBeCloseTo(0.5)
    expect(engageFill(ENGAGE_MIN_FRAMES)).toBe(1)
    expect(engageFill(ENGAGE_MIN_FRAMES + 5)).toBe(1)
  })
})

describe("engageDone", () => {
  test("ends only when ready after the minimum show time", () => {
    expect(engageDone(0, false)).toBe(false)
    expect(engageDone(ENGAGE_MIN_FRAMES, false)).toBe(false)
    expect(engageDone(ENGAGE_MIN_FRAMES - 1, true)).toBe(false)
    expect(engageDone(ENGAGE_MIN_FRAMES, true)).toBe(true)
  })

  test("hard ceiling ends a boot that never becomes ready", () => {
    expect(engageDone(ENGAGE_MAX_FRAMES - 1, false)).toBe(false)
    expect(engageDone(ENGAGE_MAX_FRAMES, false)).toBe(true)
  })

  test("clamps negative frames to zero", () => {
    expect(engageDone(-1, true)).toBe(false)
  })
})

describe("markTone", () => {
  test("error red, queued and stale warning, live success, the rest muted", () => {
    expect(markTone("error")).toBe("error")
    expect(markTone("queued")).toBe("warning")
    expect(markTone("stale")).toBe("warning")
    expect(markTone("live")).toBe("success")
    expect(markTone("ready")).toBe("textMuted")
    expect(markTone("archived")).toBe("textMuted")
    expect(markTone("idle")).toBe("textMuted")
  })
})

describe("stateGlyph", () => {
  test("error is a red cross; queued a warning hourglass", () => {
    expect(stateGlyph("error")).toEqual({ char: "×", tone: "error" })
    expect(stateGlyph("queued")).toEqual({ char: "⧗", tone: "warning" })
  })

  test("ready / archived / idle are a muted dot", () => {
    expect(stateGlyph("ready")).toEqual({ char: "•", tone: "textMuted" })
    expect(stateGlyph("archived")).toEqual({ char: "•", tone: "textMuted" })
    expect(stateGlyph("idle")).toEqual({ char: "•", tone: "textMuted" })
  })

  test("live / stale spin the braille spinner with the matching tone", () => {
    expect(stateGlyph("live", 0)).toEqual({ char: "⠋", tone: "success" })
    expect(stateGlyph("stale", 1)).toEqual({ char: "⠙", tone: "warning" })
  })
})

describe("directionGlyph", () => {
  test("wait is a blinking warning clock, recv a blinking success arrow, tool a blinking primary arrow", () => {
    expect(directionGlyph("wait")).toEqual({ char: "◷", tone: "warning", blink: true })
    expect(directionGlyph("recv")).toEqual({ char: "←", tone: "success", blink: true })
    expect(directionGlyph("tool")).toEqual({ char: "→", tone: "primary", blink: true })
  })

  test("null is quiet", () => {
    expect(directionGlyph(null)).toBeNull()
  })
})

describe("defaultBodyTone", () => {
  test("files and groups are muted regardless of mark", () => {
    expect(defaultBodyTone("file", "live", false)).toBe("textMuted")
    expect(defaultBodyTone("group", "error", false)).toBe("textMuted")
  })

  test("agents follow the mark tone", () => {
    expect(defaultBodyTone("agent", "live", false)).toBe("success")
    expect(defaultBodyTone("agent", "error", false)).toBe("error")
    expect(defaultBodyTone("agent", undefined, false)).toBe("textMuted")
  })

  test("current tints a neutral mark to primary but never overrides a live mark", () => {
    expect(defaultBodyTone("agent", undefined, true)).toBe("primary")
    expect(defaultBodyTone("agent", "live", true)).toBe("success")
  })
})
