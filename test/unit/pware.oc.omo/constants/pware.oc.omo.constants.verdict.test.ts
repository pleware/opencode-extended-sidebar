import { describe, expect, test } from "bun:test"
import {
  VERDICTS,
  VERDICT_APPROVED,
  VERDICT_BLOCKED,
  VERDICT_FAIL,
  VERDICT_INCONCLUSIVE,
  VERDICT_PASS,
  VERDICT_WORKING,
  type Verdict,
} from "../../../../src/pware.oc.omo/constants/pware.oc.omo.constants.verdict.js"

describe("VERDICTS", () => {
  test("covers the lane verdict vocabulary", () => {
    expect(VERDICTS).toEqual([
      VERDICT_PASS,
      VERDICT_FAIL,
      VERDICT_INCONCLUSIVE,
      VERDICT_APPROVED,
      VERDICT_BLOCKED,
      VERDICT_WORKING,
    ])
  })

  test("values are distinct and lowercase", () => {
    const seen = new Set<string>()
    for (const v of VERDICTS) {
      expect(seen.has(v)).toBe(false)
      expect(v === v.toLowerCase()).toBe(true)
      seen.add(v)
    }
  })
})

describe("Verdict type", () => {
  test("is the element type of the verdicts tuple", () => {
    const v: Verdict = VERDICT_BLOCKED
    expect(v).toBe(VERDICT_BLOCKED)
  })
})
