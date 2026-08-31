import { describe, expect, test } from "bun:test"
import {
  BOULDER_STATUSES,
  BOULDER_STATUS_ABANDONED,
  BOULDER_STATUS_ACTIVE,
  BOULDER_STATUS_CANCELLED,
  BOULDER_STATUS_COMPLETED,
  BOULDER_STATUS_ERROR,
  BOULDER_STATUS_IN_PROGRESS,
  BOULDER_STATUS_PAUSED,
  BOULDER_STATUS_PENDING,
  BOULDER_STATUS_RUNNING,
  type BoulderStatus,
} from "../../../../src/pware.oc.omo/constants/pware.oc.omo.constants.boulderStatus.js"

describe("BOULDER_STATUSES", () => {
  test("covers every raw boulder.json status, including the omo active start state", () => {
    expect(BOULDER_STATUSES).toEqual([
      BOULDER_STATUS_IN_PROGRESS,
      BOULDER_STATUS_RUNNING,
      BOULDER_STATUS_ACTIVE,
      BOULDER_STATUS_PENDING,
      BOULDER_STATUS_COMPLETED,
      BOULDER_STATUS_ERROR,
      BOULDER_STATUS_PAUSED,
      BOULDER_STATUS_ABANDONED,
      BOULDER_STATUS_CANCELLED,
    ])
  })

  test("active is the status boulder writes when a work starts", () => {
    expect(BOULDER_STATUS_ACTIVE).toBe("active")
  })

  test("values are distinct and lowercase", () => {
    const seen = new Set<string>()
    for (const s of BOULDER_STATUSES) {
      expect(seen.has(s)).toBe(false)
      expect(s === s.toLowerCase()).toBe(true)
      seen.add(s)
    }
  })
})

describe("BoulderStatus type", () => {
  test("is the element type of the statuses tuple", () => {
    const s: BoulderStatus = BOULDER_STATUS_ACTIVE
    expect(s).toBe(BOULDER_STATUS_ACTIVE)
  })
})
