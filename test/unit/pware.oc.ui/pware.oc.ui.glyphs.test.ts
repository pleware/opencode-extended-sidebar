import { describe, expect, test } from "bun:test"
import {
  fileLetterGlyph,
  myWorkGlyph,
  reviewLaneGlyph,
  reviewStateSuffix,
} from "../../../src/pware.oc.ui/pware.oc.ui.glyphs.js"

describe("myWorkGlyph", () => {
  test("questions are a warning ? and errors a red cross", () => {
    expect(myWorkGlyph("question")).toEqual({ char: "?", tone: "warning" })
    expect(myWorkGlyph("error")).toEqual({ char: "×", tone: "error" })
  })

  test("interrupted and dismissed are muted ⊘", () => {
    expect(myWorkGlyph("interrupted")).toEqual({ char: "⊘", tone: "textMuted" })
    expect(myWorkGlyph("dismissed")).toEqual({ char: "⊘", tone: "textMuted" })
  })

  test("approvals colour by state: review warning, start primary, finished success, drafting muted", () => {
    expect(myWorkGlyph("ready-to-review")).toEqual({ char: "!", tone: "warning" })
    expect(myWorkGlyph("ready-to-start")).toEqual({ char: "▶", tone: "primary" })
    expect(myWorkGlyph("finished")).toEqual({ char: "✓", tone: "success" })
    expect(myWorkGlyph("drafting")).toEqual({ char: "…", tone: "textMuted" })
  })

  test("running is the primary ◔", () => {
    expect(myWorkGlyph("running")).toEqual({ char: "◔", tone: "primary" })
  })
})

describe("fileLetterGlyph", () => {
  test("added green, deleted red, modified yellow", () => {
    expect(fileLetterGlyph("A")).toEqual({ char: "A", tone: "success" })
    expect(fileLetterGlyph("D")).toEqual({ char: "D", tone: "error" })
    expect(fileLetterGlyph("M")).toEqual({ char: "M", tone: "warning" })
  })

  test("the rest are muted, and a missing letter is a muted dot", () => {
    expect(fileLetterGlyph("R")).toEqual({ char: "R", tone: "textMuted" })
    expect(fileLetterGlyph("C")).toEqual({ char: "C", tone: "textMuted" })
    expect(fileLetterGlyph("T")).toEqual({ char: "T", tone: "textMuted" })
    expect(fileLetterGlyph("U")).toEqual({ char: "U", tone: "textMuted" })
    expect(fileLetterGlyph("?")).toEqual({ char: "?", tone: "textMuted" })
    expect(fileLetterGlyph("V")).toEqual({ char: "V", tone: "textMuted" })
    expect(fileLetterGlyph(null)).toEqual({ char: "•", tone: "textMuted" })
  })
})

describe("reviewLaneGlyph", () => {
  test("terminal lane states have stable glyphs and tones", () => {
    expect(reviewLaneGlyph({ status: "approved", result: null })).toEqual({ char: "✓", tone: "success" })
    expect(reviewLaneGlyph({ status: "changes_requested", result: null })).toEqual({
      char: "!",
      tone: "warning",
    })
    expect(reviewLaneGlyph({ status: "inconclusive", result: null })).toEqual({
      char: "?",
      tone: "warning",
    })
  })

  test("pending is a muted dot, live lanes the muted ellipsis, unknown stays a muted dot", () => {
    expect(reviewLaneGlyph({ status: "pending", result: null })).toEqual({ char: "·", tone: "textMuted" })
    expect(reviewLaneGlyph({ status: "launching", result: null })).toEqual({
      char: "…",
      tone: "textMuted",
    })
    expect(reviewLaneGlyph({ status: "in_flight", result: null })).toEqual({
      char: "…",
      tone: "textMuted",
    })
    expect(reviewLaneGlyph(null)).toEqual({ char: "·", tone: "textMuted" })
    expect(reviewLaneGlyph(undefined)).toEqual({ char: "·", tone: "textMuted" })
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
