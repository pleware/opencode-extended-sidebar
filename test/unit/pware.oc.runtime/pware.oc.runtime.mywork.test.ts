import { describe, expect, test } from "bun:test"
import {
  approvalContinueHint,
  groupMyWork,
  myWorkLabel,
  MY_WORK_ORDER,
  startWorkCommand,
  toApprovalItems,
  toQuestionItems,
  type MyWorkItem,
} from "../../../src/pware.oc.runtime/pware.oc.runtime.mywork.js"

const question: MyWorkItem = {
  kind: "question",
  sessionId: "ses_1",
  title: "hello",
  startedAt: 1_000,
  reason: null,
}

const approval: MyWorkItem = {
  kind: "ready-to-review",
  name: "plan.md",
  rel: "plans/plan.md",
  pendingAction: "write .omo/plans/plan.md",
  updatedAt: 2_000,
  sessionState: null,
  review: null,
}

describe("myWorkLabel", () => {
  test("labels map to the seven actionable groups", () => {
    expect(myWorkLabel("question")).toBe("Awaiting answer")
    expect(myWorkLabel("interrupted")).toBe("Interrupted")
    expect(myWorkLabel("error")).toBe("Errors")
    expect(myWorkLabel("ready-to-review")).toBe("Ready to review")
    expect(myWorkLabel("ready-to-start")).toBe("Ready to start")
    expect(myWorkLabel("finished")).toBe("Finished")
    expect(myWorkLabel("drafting")).toBe("Drafting")
  })
})

describe("toQuestionItems", () => {
  test("carries session id, title, start, kind and reason through from the row", () => {
    const items = toQuestionItems([
      { sessionId: "ses_1", title: "Plan approval?", startedAt: 1_000, kind: "question", reason: null },
      { sessionId: "ses_2", title: "Which lib?", startedAt: null, kind: "interrupted", reason: "Tool execution aborted" },
      { sessionId: "ses_3", title: "Bad question", startedAt: 2_000, kind: "error", reason: "boom" },
    ])
    expect(items).toEqual([
      { kind: "question", sessionId: "ses_1", title: "Plan approval?", startedAt: 1_000, reason: null },
      { kind: "interrupted", sessionId: "ses_2", title: "Which lib?", startedAt: null, reason: "Tool execution aborted" },
      { kind: "error", sessionId: "ses_3", title: "Bad question", startedAt: 2_000, reason: "boom" },
    ])
  })
})

describe("toApprovalItems", () => {
  test("maps status + draftness to the group kind and keeps sessionState", () => {
    const items = toApprovalItems([
      {
        rel: "drafts/plan.md",
        name: "plan",
        status: "drafting",
        pendingAction: "write .omo/plans/plan.md",
        updatedAt: 2_000,
        sessionState: { running: true, state: "streaming" },
        review: null,
      },
      {
        rel: "plans/other.md",
        name: "other",
        status: "approved",
        pendingAction: null,
        updatedAt: null,
        sessionState: { running: false, state: "idle" },
        review: null,
      },
      {
        rel: "plans/lone.md",
        name: "lone",
        status: "awaiting-approval",
        pendingAction: null,
        updatedAt: null,
        sessionState: null,
        review: null,
      },
    ])
    expect(items.map((i) => i.kind)).toEqual(["drafting", "ready-to-start", "ready-to-review"])
    const plan = items[0]
    expect(plan?.kind).toBe("drafting")
    if (plan && !("sessionId" in plan)) expect(plan.sessionState).toEqual({ running: true, state: "streaming" })
    const lone = items[2]
    if (lone && !("sessionId" in lone)) expect(lone.sessionState).toBeNull()
  })

  test("drops superseded plans — approved/done drafts and unknown status", () => {
    const items = toApprovalItems([
      { rel: "drafts/a.md", name: "a", status: "approved", pendingAction: null, updatedAt: null, sessionState: null, review: null },
      { rel: "drafts/b.md", name: "b", status: "done", pendingAction: null, updatedAt: null, sessionState: null, review: null },
      { rel: "drafts/c.md", name: "c", status: "unknown", pendingAction: null, updatedAt: null, sessionState: null, review: null },
      { rel: "plans/d.md", name: "d", status: "done", pendingAction: null, updatedAt: null, sessionState: null, review: null },
    ])
    expect(items.map((i) => i.kind)).toEqual(["finished"])
    expect(items.map((i) => ("sessionId" in i ? null : i.name))).toEqual(["d"])
  })

  test("a drafting status becomes a drafting item and carries the review state", () => {
    const items = toApprovalItems([
      {
        rel: "drafts/wip.md",
        name: "wip",
        status: "drafting",
        pendingAction: null,
        updatedAt: null,
        sessionState: { running: true, state: "streaming" },
        review: {
          required: true,
          roundId: null,
          roundStatus: null,
          planSha256: null,
          lanes: {
            momus: { status: "pending", result: null },
            independent: { status: "pending", result: null },
          },
        },
      },
    ])
    expect(items.map((i) => i.kind)).toEqual(["drafting"])
    const item = items[0]
    if (!item || "sessionId" in item) throw new Error("expected an approval item")
    expect(item.review?.required).toBe(true)
  })
})

describe("groupMyWork", () => {
  test("orders question kinds then ready-to-review, ready-to-start, finished, drafting and drops empty kinds", () => {
    const interrupted: MyWorkItem = { ...question, kind: "interrupted", reason: "aborted" }
    const errored: MyWorkItem = { ...question, kind: "error", reason: "boom" }
    const readyStart: MyWorkItem = { ...approval, kind: "ready-to-start" }
    const finished: MyWorkItem = { ...approval, kind: "finished" }
    const drafting: MyWorkItem = { ...approval, kind: "drafting" }
    expect(
      groupMyWork([finished, approval, readyStart, drafting, question, interrupted, errored]).map((g) => g.kind),
    ).toEqual(["question", "interrupted", "error", "ready-to-review", "ready-to-start", "finished", "drafting"])
    expect(groupMyWork([question]).map((g) => g.kind)).toEqual(["question"])
    expect(groupMyWork([])).toEqual([])
  })

  test("order constant matches the grouped order", () => {
    expect(MY_WORK_ORDER).toEqual([
      "question",
      "interrupted",
      "error",
      "ready-to-review",
      "ready-to-start",
      "finished",
      "drafting",
    ])
  })
})

describe("approvalContinueHint", () => {
  test("null when a session is available", () => {
    expect(approvalContinueHint("ses_1", true)).toBeNull()
    expect(approvalContinueHint("ses_1", false)).toBeNull()
  })

  test("names the missing writer when the database was readable", () => {
    expect(approvalContinueHint(null, true)).toBe("No session wrote this plan")
  })

  test("names the unavailable database when it could not be opened", () => {
    expect(approvalContinueHint(null, false)).toBe("Database unavailable")
  })

  test("undefined session behaves like null", () => {
    expect(approvalContinueHint(undefined, true)).toBe("No session wrote this plan")
  })
})

describe("startWorkCommand", () => {
  test("builds the exact command text per delivery mode", () => {
    expect(startWorkCommand("plain")).toBe("start work")
    expect(startWorkCommand("make-pr")).toBe("start work --make-pr")
    expect(startWorkCommand("ship")).toBe("start work --ship")
  })

  test("targets the clicked plan when a name is given", () => {
    expect(startWorkCommand("plain", "perf-x")).toBe("start work perf-x")
    expect(startWorkCommand("make-pr", "perf-x")).toBe("start work perf-x --make-pr")
    expect(startWorkCommand("ship", "perf-x")).toBe("start work perf-x --ship")
  })

  test("trims and skips empty plan names", () => {
    expect(startWorkCommand("ship", "  perf-x  ")).toBe("start work perf-x --ship")
    expect(startWorkCommand("plain", "")).toBe("start work")
    expect(startWorkCommand("make-pr", null)).toBe("start work --make-pr")
  })
})
