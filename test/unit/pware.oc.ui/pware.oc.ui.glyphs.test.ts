import { describe, expect, test } from "bun:test"
import {
  fileLetterMark,
  flowBlinkOn,
  flowGlyph,
  markGlyph,
  myWorkGlyph,
  reviewLaneGlyph,
  reviewStateSuffix,
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
  test("questions use ?, drafting the ellipsis, approvals ! — plain ASCII", () => {
    expect(myWorkGlyph("question")).toBe("?")
    expect(myWorkGlyph("drafting")).toBe("…")
    expect(myWorkGlyph("pending")).toBe("!")
    expect(myWorkGlyph("working")).toBe("!")
    expect(myWorkGlyph("idle")).toBe("!")
  })
})

describe("reviewLaneGlyph", () => {
  test("terminal lane states have stable glyphs", () => {
    expect(reviewLaneGlyph({ status: "approved", result: null })).toBe("✓")
    expect(reviewLaneGlyph({ status: "changes_requested", result: null })).toBe("!")
    expect(reviewLaneGlyph({ status: "inconclusive", result: null })).toBe("?")
  })

  test("pending is a dot, live lanes the ellipsis, unknown stays a dot", () => {
    expect(reviewLaneGlyph({ status: "pending", result: null })).toBe("·")
    expect(reviewLaneGlyph({ status: "launching", result: null })).toBe("…")
    expect(reviewLaneGlyph({ status: "in_flight", result: null })).toBe("…")
    expect(reviewLaneGlyph(null)).toBe("·")
    expect(reviewLaneGlyph(undefined)).toBe("·")
  })
})

describe("reviewStateSuffix", () => {
  test("null when there is no review state", () => {
    expect(reviewStateSuffix(null)).toBeNull()
    expect(reviewStateSuffix(undefined)).toBeNull()
  })

  test("a live round shows R<id> plus the two lanes in order", () => {
    expect(
      reviewStateSuffix({
        required: true,
        roundId: "rnd-2",
        roundStatus: "active",
        planSha256: "abc",
        lanes: {
          momus: { status: "in_flight", result: null },
          independent: { status: "approved", result: "pass" },
        },
      }),
    ).toBe("Rrnd-2 …✓")
  })

  test("an active round without an id collapses to R…", () => {
    expect(
      reviewStateSuffix({
        required: true,
        roundId: null,
        roundStatus: "active",
        planSha256: null,
        lanes: {
          momus: { status: "launching", result: null },
          independent: { status: "pending", result: null },
        },
      }),
    ).toBe("R… …·")
  })

  test("terminal lanes without a round are just the two glyphs", () => {
    expect(
      reviewStateSuffix({
        required: true,
        roundId: null,
        roundStatus: null,
        planSha256: null,
        lanes: {
          momus: { status: "approved", result: null },
          independent: { status: "changes_requested", result: null },
        },
      }),
    ).toBe("✓!")
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
