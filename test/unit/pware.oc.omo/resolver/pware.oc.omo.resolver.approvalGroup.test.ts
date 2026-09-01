import { describe, expect, test } from "bun:test"
import {
  PLAN_STATUS_APPROVED,
  PLAN_STATUS_DONE,
} from "../../../../src/pware.oc.omo/constants/pware.oc.omo.constants.planStatus.js"
import {
  approvalGroup,
  isDrafting,
  isDraftOf,
  isFinished,
  isPendingApproval,
  isReadyToReview,
  isReadyToStart,
  isWaitingApproval,
  planWorkDone,
  resolveApprovalGroup,
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

describe("planWorkDone", () => {
  test("a completed boulder work finishes regardless of the frontmatter status", () => {
    expect(planWorkDone("approved", "completed", false)).toBe(true)
    expect(planWorkDone("awaiting-approval", "completed", false)).toBe(true)
  })

  test("writer todos finish only an approved plan, never a pending/drafting one", () => {
    expect(planWorkDone("approved", "absent", true)).toBe(true)
    expect(planWorkDone("awaiting-approval", "absent", true)).toBe(false)
    expect(planWorkDone("drafting", "absent", true)).toBe(false)
  })

  test("a present-but-not-completed boulder work never finishes via todos", () => {
    expect(planWorkDone("approved", "not-completed", true)).toBe(false)
  })

  test("no evidence means not done", () => {
    expect(planWorkDone("approved", "absent", false)).toBe(false)
    expect(planWorkDone(null, "absent", false)).toBe(false)
  })
})

describe("resolveApprovalGroup", () => {
  test("boulder completed → finished for a plan, superseded for a draft", () => {
    expect(resolveApprovalGroup("approved", false, "completed", false)).toBe("finished")
    expect(resolveApprovalGroup("approved", true, "completed", false)).toBeNull()
  })

  test("writer todos done → finished only for an approved plan", () => {
    expect(resolveApprovalGroup("approved", false, "absent", true)).toBe("finished")
    expect(resolveApprovalGroup("awaiting-approval", false, "absent", true)).toBe("ready-to-review")
  })

  test("a not-completed boulder work falls back to the frontmatter mapping", () => {
    expect(resolveApprovalGroup("approved", false, "not-completed", true)).toBe("ready-to-start")
  })

  test("no evidence falls back to approvalGroup", () => {
    expect(resolveApprovalGroup("done", false, "absent", false)).toBe("finished")
    expect(resolveApprovalGroup("pending", false, "absent", false)).toBe("ready-to-review")
  })
})

describe("plan group predicates", () => {
  test("isDrafting", () => {
    expect(isDrafting("drafting")).toBe(true)
    expect(isDrafting("finished")).toBe(false)
    expect(isDrafting(null)).toBe(false)
  })

  test("isReadyToReview, isWaitingApproval and isPendingApproval are aliases", () => {
    expect(isReadyToReview("ready-to-review")).toBe(true)
    expect(isWaitingApproval("ready-to-review")).toBe(true)
    expect(isPendingApproval("ready-to-review")).toBe(true)
    expect(isReadyToReview("ready-to-start")).toBe(false)
  })

  test("isReadyToStart", () => {
    expect(isReadyToStart("ready-to-start")).toBe(true)
    expect(isReadyToStart(null)).toBe(false)
  })

  test("isFinished", () => {
    expect(isFinished("finished")).toBe(true)
    expect(isFinished("drafting")).toBe(false)
  })
})
