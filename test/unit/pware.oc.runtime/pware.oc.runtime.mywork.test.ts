import { describe, expect, test } from "bun:test"
import {
  approvalContinueHint,
  dropDismissed,
  formatDismissed,
  groupMyWork,
  myWorkLabel,
  MY_WORK_ORDER,
  parseDismissed,
  startWorkCommand,
  toApprovalItems,
  toDraftDocItems,
  toPlanItems,
  toQuestionItems,
  toSessionItems,
  type MyWorkItem,
} from "../../../src/pware.oc.runtime/pware.oc.runtime.mywork.js"

const question: MyWorkItem = {
  kind: "question",
  partId: "prt_1",
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
  test("labels map to the My work groups", () => {
    expect(myWorkLabel("pinned")).toBe("Pinned")
    expect(myWorkLabel("question")).toBe("Awaiting answer")
    expect(myWorkLabel("interrupted")).toBe("Interrupted")
    expect(myWorkLabel("error")).toBe("Errors")
    expect(myWorkLabel("sessions")).toBe("Sessions")
    expect(myWorkLabel("ready-to-review")).toBe("Ready to review")
    expect(myWorkLabel("ready-to-start")).toBe("Ready to start")
    expect(myWorkLabel("finished")).toBe("Finished")
    expect(myWorkLabel("dismissed")).toBe("Dismissed questions")
    expect(myWorkLabel("drafting")).toBe("Drafting")
    expect(myWorkLabel("draft-docs")).toBe("Draft docs")
    expect(myWorkLabel("plans")).toBe("Plans")
  })
})

describe("toQuestionItems", () => {
  test("carries part id, session id, title, start, kind and reason through from the row", () => {
    const items = toQuestionItems([
      { partId: "prt_1", sessionId: "ses_1", title: "Plan approval?", startedAt: 1_000, kind: "question", reason: null },
      { partId: "prt_2", sessionId: "ses_2", title: "Which lib?", startedAt: null, kind: "interrupted", reason: "Tool execution aborted" },
      { partId: "prt_3", sessionId: "ses_3", title: "Bad question", startedAt: 2_000, kind: "error", reason: "boom" },
    ])
    expect(items).toEqual([
      { kind: "question", partId: "prt_1", sessionId: "ses_1", title: "Plan approval?", startedAt: 1_000, reason: null },
      { kind: "interrupted", partId: "prt_2", sessionId: "ses_2", title: "Which lib?", startedAt: null, reason: "Tool execution aborted" },
      { kind: "error", partId: "prt_3", sessionId: "ses_3", title: "Bad question", startedAt: 2_000, reason: "boom" },
    ])
  })
})

describe("dismissed questions", () => {
  test("parseDismissed turns a JSON array of ids into a set", () => {
    expect(parseDismissed('["prt_1","prt_2"]')).toEqual(new Set(["prt_1", "prt_2"]))
  })

  test("parseDismissed tolerates empty, malformed, and non-array input", () => {
    expect(parseDismissed(null)).toEqual(new Set())
    expect(parseDismissed(undefined)).toEqual(new Set())
    expect(parseDismissed("")).toEqual(new Set())
    expect(parseDismissed("{broken")).toEqual(new Set())
    expect(parseDismissed('{"a":1}')).toEqual(new Set())
  })

  test("parseDismissed keeps only non-empty string ids", () => {
    expect(parseDismissed('["prt_1", 42, "", null, true]')).toEqual(new Set(["prt_1"]))
  })

  test("formatDismissed round-trips through parseDismissed", () => {
    expect(parseDismissed(formatDismissed(new Set(["prt_1", "prt_2"])))).toEqual(new Set(["prt_1", "prt_2"]))
  })

  test("dropDismissed moves matching question items to dismissed and leaves the rest", () => {
    const items: MyWorkItem[] = [
      { kind: "question", partId: "prt_1", sessionId: "ses_1", title: "a", startedAt: null, reason: null },
      { kind: "error", partId: "prt_2", sessionId: "ses_2", title: "b", startedAt: null, reason: "boom" },
      { kind: "sessions", sessionId: "ses_9", title: "c", status: "running", timeUpdated: 1_000 },
      { kind: "ready-to-review", name: "plan", rel: "plans/plan.md", pendingAction: null, updatedAt: null, sessionState: null, review: null },
    ]
    const out = dropDismissed(items, new Set(["prt_1"]))
    expect(out).toEqual([
      { kind: "dismissed", partId: "prt_1", sessionId: "ses_1", title: "a", startedAt: null, reason: null },
      { kind: "error", partId: "prt_2", sessionId: "ses_2", title: "b", startedAt: null, reason: "boom" },
      { kind: "sessions", sessionId: "ses_9", title: "c", status: "running", timeUpdated: 1_000 },
      { kind: "ready-to-review", name: "plan", rel: "plans/plan.md", pendingAction: null, updatedAt: null, sessionState: null, review: null },
    ])
  })

  test("dropDismissed passes non-dismissed rows through when the set is empty", () => {
    const items: MyWorkItem[] = [
      { kind: "question", partId: "prt_1", sessionId: "ses_1", title: "a", startedAt: null, reason: null },
    ]
    expect(dropDismissed(items, new Set())).toEqual(items)
  })

  test("dropDismissed moves dismissed-question errors into dismissed even without kv ids", () => {
    const items: MyWorkItem[] = [
      {
        kind: "error",
        partId: "prt_1",
        sessionId: "ses_1",
        title: "a",
        startedAt: null,
        reason: "The user dismissed this question",
      },
      {
        kind: "error",
        partId: "prt_2",
        sessionId: "ses_2",
        title: "b",
        startedAt: null,
        reason: "Tool execution aborted",
      },
    ]
    expect(dropDismissed(items, new Set())).toEqual([
      {
        kind: "dismissed",
        partId: "prt_1",
        sessionId: "ses_1",
        title: "a",
        startedAt: null,
        reason: "The user dismissed this question",
      },
      {
        kind: "error",
        partId: "prt_2",
        sessionId: "ses_2",
        title: "b",
        startedAt: null,
        reason: "Tool execution aborted",
      },
    ])
  })
})

describe("toSessionItems", () => {
  test("keeps every recent session, running or idle", () => {
    const items = toSessionItems([
      { id: "s1", title: "Live", status: "running", timeUpdated: 1_000 },
      { id: "s2", title: "Quiet", status: "idle", timeUpdated: null },
      { id: "s3", title: "Done", status: "archived", timeUpdated: 2_000 },
      { id: "s4", title: "Mystery", status: "unknown", timeUpdated: null },
    ])
    expect(items.map((i) => ("sessionId" in i ? i.sessionId : null))).toEqual(["s1", "s2", "s3", "s4"])
  })

  test("maps to the sessions variant carrying session id, title, status and timeUpdated", () => {
    const items = toSessionItems([
      { id: "s1", title: "Plan it", status: "running", timeUpdated: 5_000 },
    ])
    expect(items).toEqual([
      { kind: "sessions", sessionId: "s1", title: "Plan it", status: "running", timeUpdated: 5_000 },
    ])
  })
})

describe("toDraftDocItems", () => {
  test("maps each leftover draft to the draft-docs variant with name, rel and updatedAt", () => {
    const items = toDraftDocItems([
      { name: "old", rel: "drafts/old.md", updatedAt: 1_000 },
      { name: "notes", rel: "drafts/notes.md", updatedAt: null },
    ])
    expect(items).toEqual([
      { kind: "draft-docs", name: "old", rel: "drafts/old.md", updatedAt: 1_000 },
      { kind: "draft-docs", name: "notes", rel: "drafts/notes.md", updatedAt: null },
    ])
  })

  test("an empty bucket stays empty", () => {
    expect(toDraftDocItems([])).toEqual([])
  })
})

describe("toPlanItems", () => {
  test("maps each leftover plan to the plans variant with name, rel and updatedAt", () => {
    const items = toPlanItems([
      { name: "stale", rel: "plans/stale.md", updatedAt: 2_000 },
      { name: "orphan", rel: "plans/orphan.md", updatedAt: null },
    ])
    expect(items).toEqual([
      { kind: "plans", name: "stale", rel: "plans/stale.md", updatedAt: 2_000 },
      { kind: "plans", name: "orphan", rel: "plans/orphan.md", updatedAt: null },
    ])
  })

  test("an empty bucket stays empty", () => {
    expect(toPlanItems([])).toEqual([])
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
        workState: "absent",
        todosDone: false,
      },
      {
        rel: "plans/other.md",
        name: "other",
        status: "approved",
        pendingAction: null,
        updatedAt: null,
        sessionState: { running: false, state: "idle" },
        review: null,
        workState: "absent",
        todosDone: false,
      },
      {
        rel: "plans/lone.md",
        name: "lone",
        status: "awaiting-approval",
        pendingAction: null,
        updatedAt: null,
        sessionState: null,
        review: null,
        workState: "absent",
        todosDone: false,
      },
    ])
    expect(items.map((i) => i.kind)).toEqual(["drafting", "ready-to-start", "ready-to-review"])
    const plan = items[0]
    expect(plan?.kind).toBe("drafting")
    if (plan?.kind === "drafting") expect(plan.sessionState).toEqual({ running: true, state: "streaming" })
    const lone = items[2]
    if (lone?.kind === "ready-to-review") expect(lone.sessionState).toBeNull()
  })

  test("drops superseded plans — approved/done drafts and unknown status", () => {
    const items = toApprovalItems([
      { rel: "drafts/a.md", name: "a", status: "approved", pendingAction: null, updatedAt: null, sessionState: null, review: null, workState: "absent", todosDone: false },
      { rel: "drafts/b.md", name: "b", status: "done", pendingAction: null, updatedAt: null, sessionState: null, review: null, workState: "absent", todosDone: false },
      { rel: "drafts/c.md", name: "c", status: "unknown", pendingAction: null, updatedAt: null, sessionState: null, review: null, workState: "absent", todosDone: false },
      { rel: "plans/d.md", name: "d", status: "done", pendingAction: null, updatedAt: null, sessionState: null, review: null, workState: "absent", todosDone: false },
    ])
    expect(items.map((i) => i.kind)).toEqual(["finished"])
    expect(items.map((i) => ("sessionId" in i ? null : i.name))).toEqual(["d"])
  })

  test("reconciles approved plans that actually finished — boulder or writer todos", () => {
    const items = toApprovalItems([
      { rel: "plans/boulder.md", name: "boulder", status: "approved", pendingAction: null, updatedAt: null, sessionState: null, review: null, workState: "completed", todosDone: false },
      { rel: "plans/todo.md", name: "todo", status: "approved", pendingAction: null, updatedAt: null, sessionState: null, review: null, workState: "absent", todosDone: true },
      { rel: "plans/running.md", name: "running", status: "approved", pendingAction: null, updatedAt: null, sessionState: null, review: null, workState: "not-completed", todosDone: true },
      { rel: "plans/waiting.md", name: "waiting", status: "approved", pendingAction: null, updatedAt: null, sessionState: null, review: null, workState: "absent", todosDone: false },
    ])
    expect(items.map((i) => i.kind)).toEqual(["finished", "finished", "ready-to-start", "ready-to-start"])
  })

  test("writer todos do not finish a pending plan", () => {
    const items = toApprovalItems([
      { rel: "plans/p.md", name: "p", status: "awaiting-approval", pendingAction: null, updatedAt: null, sessionState: null, review: null, workState: "absent", todosDone: true },
    ])
    expect(items.map((i) => i.kind)).toEqual(["ready-to-review"])
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
        workState: "absent",
        todosDone: false,
      },
    ])
    expect(items.map((i) => i.kind)).toEqual(["drafting"])
    const item = items[0]
    if (!item || item.kind !== "drafting") throw new Error("expected a drafting item")
    expect(item.review?.required).toBe(true)
  })
})

describe("groupMyWork", () => {
  test("orders question kinds, sessions, then approvals and drops empty kinds", () => {
    const interrupted: MyWorkItem = { ...question, kind: "interrupted", reason: "aborted" }
    const errored: MyWorkItem = { ...question, kind: "error", reason: "boom" }
    const sessions: MyWorkItem = {
      kind: "sessions",
      sessionId: "ses_9",
      title: "Active",
      status: "running",
      timeUpdated: 3_000,
    }
    const readyStart: MyWorkItem = { ...approval, kind: "ready-to-start" }
    const finished: MyWorkItem = { ...approval, kind: "finished" }
    const dismissed: MyWorkItem = { ...question, kind: "dismissed", reason: "The user dismissed this question" }
    const drafting: MyWorkItem = { ...approval, kind: "drafting" }
    const draftDoc: MyWorkItem = { kind: "draft-docs", name: "old", rel: "drafts/old.md", updatedAt: null }
    const planDoc: MyWorkItem = { kind: "plans", name: "plan-x", rel: "plans/plan-x.md", updatedAt: null }
    const pinned: MyWorkItem = { kind: "pinned", sessionId: "ses_p", title: "Pinned", status: "idle", timeUpdated: 1_000 }
    expect(
      groupMyWork([finished, dismissed, draftDoc, planDoc, pinned, approval, readyStart, drafting, question, interrupted, errored, sessions]).map(
        (g) => g.kind,
      ),
    ).toEqual([
      "pinned",
      "question",
      "interrupted",
      "error",
      "sessions",
      "ready-to-review",
      "ready-to-start",
      "finished",
      "drafting",
      "draft-docs",
      "plans",
      "dismissed",
    ])
    expect(groupMyWork([question]).map((g) => g.kind)).toEqual(["question"])
    expect(groupMyWork([])).toEqual([])
  })

  test("order constant matches the grouped order", () => {
    expect(MY_WORK_ORDER).toEqual([
      "pinned",
      "question",
      "interrupted",
      "error",
      "sessions",
      "ready-to-review",
      "ready-to-start",
      "finished",
      "drafting",
      "draft-docs",
      "plans",
      "dismissed",
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
