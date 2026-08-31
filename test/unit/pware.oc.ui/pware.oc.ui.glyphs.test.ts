import { describe, expect, test } from "bun:test"
import {
  fileLetterMark,
  flowBlinkOn,
  flowGlyph,
  markGlyph,
  myWorkGlyph,
  spinnerFrame,
  workStatusGlyph,
} from "../../../src/pware.oc.ui/pware.oc.ui.glyphs.js"

describe("flowGlyph", () => {
  test("wait recv tool arrows", () => {
    expect(flowGlyph("wait")).toBe("↑")
    expect(flowGlyph("recv")).toBe("↓")
    expect(flowGlyph("tool")).toBe("→")
  })
})

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

describe("workStatusGlyph", () => {
  test("maps done / error / pending / paused / abandoned", () => {
    expect(workStatusGlyph("completed")).toBe("✓")
    expect(workStatusGlyph("failed")).toBe("×")
    expect(workStatusGlyph("in_progress")).toBeNull()
    expect(workStatusGlyph("pending")).toBe("◷")
    expect(workStatusGlyph("queued")).toBe("◷")
    expect(workStatusGlyph("paused")).toBe("║")
    expect(workStatusGlyph("abandoned")).toBe("⊘")
  })

  test("unknown stays a neutral circle", () => {
    expect(workStatusGlyph("unknown")).toBe("○")
  })
})

describe("markGlyph", () => {
  test("error is a cross; done / archived are dots", () => {
    expect(markGlyph("error")).toBe("×")
    expect(markGlyph("ready")).toBe("•")
    expect(markGlyph("archived")).toBe("•")
    expect(markGlyph("idle")).toBe("•")
  })

  test("queued waits with the clock, not an idle dot", () => {
    expect(markGlyph("queued")).toBe("◷")
  })

  test("flow wins while lit; live / stale spin", () => {
    expect(markGlyph("live", 0, "wait")).toBe("↑")
    expect(markGlyph("live", 0, "recv")).toBe("↓")
    expect(markGlyph("live", 0, "tool")).toBe("→")
    expect(markGlyph("live", 0)).toBe("⠋")
    expect(markGlyph("stale", 1)).toBe("⠙")
  })
})

describe("myWorkGlyph", () => {
  test("questions use ? and approvals use ! — plain ASCII", () => {
    expect(myWorkGlyph("question")).toBe("?")
    expect(myWorkGlyph("approval")).toBe("!")
  })
})

describe("fileLetterMark", () => {
  test("git letters map to marks", () => {
    expect(fileLetterMark("D")).toBe("error")
    expect(fileLetterMark("U")).toBe("error")
    expect(fileLetterMark("M")).toBe("stale")
    expect(fileLetterMark("A")).toBe("live")
    expect(fileLetterMark("V")).toBe("ready")
    expect(fileLetterMark(null)).toBe("ready")
  })
})
