import { describe, expect, test } from "bun:test"
import {
  directionGlyph,
  fileLetterMark,
  flowBlinkOn,
  flowGlyph,
  FLOW_DIRECTION,
  markGlyph,
  myWorkGlyph,
  reviewLaneGlyph,
  reviewStateSuffix,
  rowGlyphs,
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

describe("directionGlyph", () => {
  test("maps each flow to its direction glyph", () => {
    expect(directionGlyph("wait")).toBe("◷")
    expect(directionGlyph("recv")).toBe("←")
    expect(directionGlyph("tool")).toBe("→")
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
    expect(workStatusGlyph("pending")).toBe("⧗")
    expect(workStatusGlyph("queued")).toBe("⧗")
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

  test("queued waits with the hourglass, not an idle dot", () => {
    expect(markGlyph("queued")).toBe("⧗")
  })

  test("live / stale spin the braille spinner", () => {
    expect(markGlyph("live", 0)).toBe("⠋")
    expect(markGlyph("stale", 1)).toBe("⠙")
  })
})

describe("FLOW_DIRECTION", () => {
  test("flow direction mapping: wait up, recv left, tool right", () => {
    expect(FLOW_DIRECTION.wait).toBe("up")
    expect(FLOW_DIRECTION.recv).toBe("left")
    expect(FLOW_DIRECTION.tool).toBe("right")
  })
})

describe("rowGlyphs", () => {
  test("splits state and direction into two cells", () => {
    expect(rowGlyphs("live", 0, "wait")).toEqual({ state: "⠋", dir: "◷" })
    expect(rowGlyphs("live", 0, "recv")).toEqual({ state: "⠋", dir: "←" })
    expect(rowGlyphs("live", 0, "tool")).toEqual({ state: "⠋", dir: "→" })
    expect(rowGlyphs("ready", 0, null)).toEqual({ state: "•", dir: null })
    expect(rowGlyphs("queued", 5, "wait")).toEqual({ state: "⧗", dir: "◷" })
    expect(rowGlyphs("error", 0, undefined)).toEqual({ state: "×", dir: null })
  })
})

describe("myWorkGlyph", () => {
  test("questions use ?, approvals the review/start/finished/draft glyphs — plain ASCII", () => {
    expect(myWorkGlyph("question")).toBe("?")
    expect(myWorkGlyph("running")).toBe("◔")
    expect(myWorkGlyph("drafting")).toBe("…")
    expect(myWorkGlyph("ready-to-review")).toBe("!")
    expect(myWorkGlyph("ready-to-start")).toBe("▶")
    expect(myWorkGlyph("finished")).toBe("✓")
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
