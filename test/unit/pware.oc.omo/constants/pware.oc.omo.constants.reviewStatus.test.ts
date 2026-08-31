import { describe, expect, test } from "bun:test"
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_APPROVED,
  REVIEW_STATUS_CHANGES_REQUESTED,
  REVIEW_STATUS_INCONCLUSIVE,
  REVIEW_STATUS_IN_FLIGHT,
  REVIEW_STATUS_LAUNCHING,
  REVIEW_STATUS_PENDING,
  ROUND_STATUS_ACTIVE,
  TERMINAL_REVIEW_STATUSES,
  type ReviewStatus,
} from "../../../../src/pware.oc.omo/constants/pware.oc.omo.constants.reviewStatus.js"

describe("REVIEW_STATUSES", () => {
  test("covers the full ulw-plan lifecycle", () => {
    expect(REVIEW_STATUSES).toEqual([
      REVIEW_STATUS_PENDING,
      REVIEW_STATUS_LAUNCHING,
      REVIEW_STATUS_IN_FLIGHT,
      REVIEW_STATUS_APPROVED,
      REVIEW_STATUS_CHANGES_REQUESTED,
      REVIEW_STATUS_INCONCLUSIVE,
    ])
  })

  test("round status is a distinct constant", () => {
    expect(ROUND_STATUS_ACTIVE).toBe("active")
    expect((REVIEW_STATUSES as readonly string[])).not.toContain(ROUND_STATUS_ACTIVE)
  })

  test("terminal set is a subset of the lifecycle", () => {
    const all = new Set<string>(REVIEW_STATUSES)
    expect(TERMINAL_REVIEW_STATUSES).toHaveLength(3)
    for (const s of TERMINAL_REVIEW_STATUSES) expect(all.has(s)).toBe(true)
  })

  test("values are distinct and lowercase", () => {
    const seen = new Set<string>()
    for (const s of REVIEW_STATUSES) {
      expect(seen.has(s)).toBe(false)
      expect(s === s.toLowerCase()).toBe(true)
      seen.add(s)
    }
  })
})

describe("ReviewStatus type", () => {
  test("is the element type of the statuses tuple", () => {
    const s: ReviewStatus = REVIEW_STATUS_IN_FLIGHT
    expect(s).toBe(REVIEW_STATUS_IN_FLIGHT)
  })
})
