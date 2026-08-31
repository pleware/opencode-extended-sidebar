import { afterEach, describe, expect, test } from "bun:test"
import {
  currentTask,
  isOmoPresent,
  readOmo,
  workIsTerminal,
  workRowView,
  workStatusGlyph,
} from "../../src/omo.js"
import { createFixtureProject, type FixtureProject } from "../helpers/project.js"

const held: FixtureProject[] = []

function fixture(boulder: Record<string, unknown>, plans?: Record<string, string>): string {
  const proj = createFixtureProject({ boulder, plans })
  held.push(proj)
  return proj.root
}

afterEach(() => {
  for (const p of held.splice(0)) p.dispose()
})

describe("omo works", () => {
  test("WorkView includes project-relative planPath per work", () => {
    const planRel = "plans/refactor-auth.md"
    const root = fixture(
      {
        works: {
          work_a: {
            plan_name: "refactor-auth",
            active_plan: planRel,
            status: "queued",
            updated_at: Date.now(),
          },
        },
      },
      { [planRel]: "- [ ] step one\n" },
    )
    const snap = readOmo(root)
    expect(snap.present).toBe(true)
    const work = snap.works.find((w) => w.workId === "work_a")
    expect(work?.planPath).toBe(planRel)
    expect(work?.sessionId).toBeNull()
  })

  test("work without active_plan inherits the boulder planPath", () => {
    const planRel = "plans/shared.md"
    const root = fixture(
      {
        active_plan: planRel,
        works: {
          work_b: {
            plan_name: "shared",
            status: "in_progress",
            session_ids: ["opencode:ses_abc"],
            updated_at: Date.now(),
          },
        },
      },
      { [planRel]: "- [ ] shared\n" },
    )
    const work = readOmo(root).works.find((w) => w.workId === "work_b")
    expect(work?.planPath).toBe(planRel)
    expect(work?.sessionId).toBe("ses_abc")
  })

  test("two runs of the same plan stay two rows — dedup is by work_id", () => {
    const root = fixture({
      active_work_id: "work_2",
      works: {
        work_1: { plan_name: "refactor-auth", status: "completed", updated_at: 1_000 },
        work_2: { plan_name: "refactor-auth", status: "active", updated_at: 2_000 },
      },
    })
    const works = readOmo(root).works
    expect(works.length).toBe(2)
    expect(works[0]?.workId).toBe("work_2")
    expect(works[0]?.current).toBe(true)
    expect(works[1]?.current).toBe(false)
  })

  test("the root mirror is not a separate work when a works map exists", () => {
    const root = fixture({
      active_work_id: "work_1",
      plan_name: "refactor-auth",
      status: "active",
      works: {
        work_1: { plan_name: "refactor-auth", status: "active", updated_at: 2_000 },
      },
    })
    expect(readOmo(root).works.length).toBe(1)
  })

  test("a legacy state with no works map is one work", () => {
    const root = fixture({ plan_name: "legacy", status: "active", updated_at: 5 })
    const works = readOmo(root).works
    expect(works.length).toBe(1)
    expect(works[0]?.name).toBe("legacy")
    expect(works[0]?.current).toBe(true)
  })

  test("a dangling active_work_id falls back to the newest work", () => {
    const root = fixture({
      active_work_id: "gone",
      works: {
        old: { plan_name: "old", status: "paused", updated_at: 1_000 },
        fresh: { plan_name: "fresh", status: "paused", updated_at: 9_000 },
      },
    })
    const works = readOmo(root).works
    expect(works[0]?.workId).toBe("fresh")
    expect(works[0]?.current).toBe(true)
    expect(works.filter((w) => w.current).length).toBe(1)
  })

  test("session_origins ride along with the work sessions", () => {
    const root = fixture({
      works: {
        work_a: {
          plan_name: "auth",
          status: "active",
          session_ids: ["opencode:ses_root", "ses_child"],
          session_origins: { "opencode:ses_root": "direct", ses_child: "appended" },
        },
      },
    })
    const sessions = readOmo(root).works[0]?.sessions ?? []
    expect(sessions.map((s) => s.id)).toEqual(["ses_root", "ses_child"])
    expect(sessions.map((s) => s.origin)).toEqual(["direct", "appended"])
  })
})

describe("omo boulder", () => {
  test("mirrors the active work with task timers and counts", () => {
    const root = fixture({
      active_work_id: "work_a",
      agent: "atlas",
      status: "active",
      plan_name: "refactor-auth",
      updated_at: 4_000,
      works: {
        work_a: {
          plan_name: "refactor-auth",
          status: "active",
          agent: "atlas",
          elapsed_ms: 720_000,
          session_ids: ["opencode:ses_main"],
          updated_at: 4_000,
          task_sessions: {
            "todo:1": { task_title: "first", status: "completed", elapsed_ms: 1_000 },
            "todo:3": {
              task_label: "todo:3",
              task_title: "wire session jump",
              status: "running",
              agent: "junior",
              category: "implement",
              started_at: 3_000,
            },
            "todo:9": { task_title: "dropped", status: "cancelled" },
          },
        },
      },
    })
    const b = readOmo(root).boulder
    expect(b.workId).toBe("work_a")
    expect(b.agent).toBe("atlas")
    expect(b.elapsedMs).toBe(720_000)
    expect(b.sessions.map((s) => s.id)).toEqual(["ses_main"])
    expect(b.counts).toEqual({ running: 1, done: 1, other: 1, total: 3 })

    const task = currentTask(b)
    expect(task?.taskKey).toBe("todo:3")
    expect(task?.label).toBe("todo:3")
    expect(task?.category).toBe("implement")
    expect(task?.startedAt).toBe(3_000_000)
  })

  test("delegates still come out of the same task list", () => {
    const root = fixture({
      task_sessions: {
        task_1: { task_title: "review", session_id: "opencode:ses_x", agent: "oracle", status: "running" },
      },
      plan_name: "plan",
      status: "active",
    })
    const snap = readOmo(root)
    expect(snap.delegates.length).toBe(1)
    expect(snap.delegates[0]?.sessionId).toBe("ses_x")
    expect(snap.delegates[0]?.agent).toBe("oracle")
  })

  test("no boulder at all is an empty view, not a throw", () => {
    const proj = createFixtureProject()
    held.push(proj)
    const snap = readOmo(proj.root)
    expect(snap.present).toBe(false)
    expect(snap.works).toEqual([])
    expect(snap.boulder.counts.total).toBe(0)
    expect(currentTask(snap.boulder)).toBeNull()
  })
})

describe("omo presence", () => {
  test("the config marker alone — no boulder — is still an installed omo", () => {
    const proj = createFixtureProject({ omo: true })
    held.push(proj)
    const snap = readOmo(proj.root)
    expect(snap.present).toBe(true)
    expect(snap.boulderPath).toBeNull()
    expect(snap.works).toEqual([])
    expect(snap.boulder.counts.total).toBe(0)
    expect(currentTask(snap.boulder)).toBeNull()
  })

  test("the marker under .sisyphus counts too", () => {
    const proj = createFixtureProject({ sisyphus: true })
    held.push(proj)
    expect(readOmo(proj.root).present).toBe(true)
  })

  test("a boulder without a marker still counts as present", () => {
    const root = fixture({ status: "active", plan_name: "legacy" })
    expect(readOmo(root).present).toBe(true)
  })

  test("isOmoPresent answers from the marker alone", () => {
    const withMarker = createFixtureProject({ omo: true })
    held.push(withMarker)
    const without = createFixtureProject()
    held.push(without)
    expect(isOmoPresent(withMarker.root)).toBe(true)
    expect(isOmoPresent(without.root)).toBe(false)
  })
})

describe("workStatusGlyph", () => {
  test("maps done / pending / error; running stays a spinner", () => {
    expect(workStatusGlyph("completed")).toBe("✓")
    expect(workStatusGlyph("queued")).toBe("○")
    expect(workStatusGlyph("failed")).toBe("×")
    expect(workStatusGlyph("in_progress")).toBeNull()
    expect(workStatusGlyph("unknown")).toBe("○")
  })

  test("paused and abandoned get their own glyph", () => {
    expect(workStatusGlyph("paused")).toBe("⏸")
    expect(workStatusGlyph("abandoned")).toBe("⊘")
  })
})

describe("workIsTerminal", () => {
  test("a deliberate stop counts as terminal, a run does not", () => {
    expect(workIsTerminal("paused")).toBe(true)
    expect(workIsTerminal("abandoned")).toBe(true)
    expect(workIsTerminal("completed")).toBe(true)
    expect(workIsTerminal("failed")).toBe(true)
    expect(workIsTerminal("active")).toBe(false)
    expect(workIsTerminal("queued")).toBe(false)
  })
})

describe("workRowView", () => {
  test("terminal error is an error mark; running pulses from age", () => {
    const err = workRowView({ status: "failed", updatedAt: Date.now() }, Date.now())
    expect(err.mark).toBe("error")
    expect(err.glyph).toBe("×")
    const live = workRowView({ status: "in_progress", updatedAt: Date.now() }, Date.now())
    expect(live.mark).toBe("live")
    expect(live.glyph).toBeNull()
    expect(live.suffix).toBe("0s")
  })
})
