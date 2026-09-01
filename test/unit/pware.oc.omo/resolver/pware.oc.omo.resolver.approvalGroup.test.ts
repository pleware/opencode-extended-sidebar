import { describe, expect, test } from "bun:test"
import {
  PLAN_STATUS_APPROVED,
  PLAN_STATUS_DONE,
} from "../../../../src/pware.oc.omo/constants/pware.oc.omo.constants.planStatus.js"
import {
  approvalGroup,
  isDraftOf,
} from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.approvalGroup.js"

describe("approvalGroup", () => {
  test("drafting status is a draft group regardless of draftness", () => {
    expect(approvalGroup("drafting", true)).toBe("drafting")
    expect(approvalGroup("drafting", false)).toBe("drafting")
  })

  test("pending statuses group as ready-to-review", () => {
    expect(approvalGroup("awaiting-approval", true)).toBe("ready-to-review")
    expect(approvalGroup("awaiting-approval", false)).toBe("ready-to-review")
    expect(approvalGroup("pending-approval", false)).toBe("ready-to-review")
    expect(approvalGroup("pending_approval", false)).toBe("ready-to-review")
    expect(approvalGroup("pending", false)).toBe("ready-to-review")
  })

  test("approved is ready-to-start for a plan, superseded for a draft", () => {
    expect(approvalGroup("approved", false)).toBe("ready-to-start")
    expect(approvalGroup("approved", true)).toBeNull()
  })

  test("done is finished for a plan, superseded for a draft", () => {
    expect(approvalGroup("done", false)).toBe("finished")
    expect(approvalGroup("done", true)).toBeNull()
  })

  test("unknown or missing status is superseded", () => {
    expect(approvalGroup(null, true)).toBeNull()
    expect(approvalGroup(null, false)).toBeNull()
    expect(approvalGroup("something-else", false)).toBeNull()
  })

  test("PLAN_STATUS_APPROVED / PLAN_STATUS_DONE are consumed by approvalGroup", () => {
    expect(approvalGroup(PLAN_STATUS_APPROVED, false)).toBe("ready-to-start")
    expect(approvalGroup(PLAN_STATUS_DONE, false)).toBe("finished")
  })
})

describe("isDraftOf", () => {
  test("draft paths under drafts/ or .sisyphus/drafts/ are drafts", () => {
    expect(isDraftOf("drafts/plan.md")).toBe(true)
    expect(isDraftOf(".sisyphus/drafts/plan.md")).toBe(true)
  })

  test("final plan paths are not drafts", () => {
    expect(isDraftOf("plans/plan.md")).toBe(false)
    expect(isDraftOf(".omo/plans/plan.md")).toBe(false)
  })
})
