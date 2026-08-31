import { afterEach, describe, expect, test } from "bun:test"
import { listSessionFiles, listToolEvents } from "../../src/db.js"
import { delegatesForSession, readLiveSnapshot, resetLiveCache } from "../../src/live.js"
import { readOmo } from "../../src/omo.js"
import { openReadonlyDb, resetReadonlyDb } from "../../src/sqlite.js"
import { boulderWithTask, createFixtureProject } from "../helpers/project.js"
import { assertPrivacy } from "../helpers/privacy.js"
import {
  createFixtureDb,
  patchPartData,
  toolPartData,
  type FixtureDb,
} from "../helpers/sqlite.js"

const NOW = Date.now()

let dbFix: FixtureDb | null = null
let projFix: ReturnType<typeof createFixtureProject> | null = null

afterEach(() => {
  resetLiveCache()
  resetReadonlyDb()
  dbFix?.dispose()
  projFix?.dispose()
  dbFix = null
  projFix = null
})

describe("no .omo — SQLite only", () => {
  test("panel loads agents, sessions, tools, files; delegates stay empty", () => {
    projFix = createFixtureProject({ oesignore: "tmp/\n" })
    dbFix = createFixtureDb({
      sessions: [
        {
          id: "ses_main",
          project_id: "proj_a",
          title: "main",
          parent_id: null,
          time_updated: NOW,
          time_created: NOW - 1_000,
        },
        {
          id: "ses_old",
          project_id: "proj_a",
          title: "earlier",
          parent_id: null,
          time_updated: NOW - 60_000,
        },
      ],
      parts: [
        {
          id: "prt_bash",
          session_id: "ses_main",
          time_created: NOW,
          data: toolPartData({ tool: "bash", command: "ls src", title: "ls src", pad: false }),
        },
        {
          id: "prt_edit",
          session_id: "ses_main",
          time_created: NOW - 10,
          data: toolPartData({
            tool: "edit",
            filePath: "src/sidebar.tsx",
            additions: 3,
            deletions: 1,
            pad: false,
          }),
        },
        {
          id: "prt_tmp",
          session_id: "ses_main",
          time_created: NOW - 20,
          data: toolPartData({ tool: "write", filePath: "tmp/scratch.md", additions: 1, pad: false }),
        },
      ],
    })
    expect(readOmo(projFix.root).present).toBe(false)
    const snap = readLiveSnapshot({
      sessionId: "ses_main",
      projectRoot: projFix.root,
      dbPath: dbFix.dbPath,
      force: true,
    })
    expect(snap.omo.present).toBe(false)
    expect(snap.db.present).toBe(true)
    expect(snap.db.current?.id).toBe("ses_main")
    expect(snap.db.recent.map((s) => s.id)).toContain("ses_main")
    expect(snap.db.tools.length).toBeGreaterThan(0)
    expect(snap.db.tools.some((t) => t.tool === "bash" && t.name !== "bash")).toBe(true)
    expect(snap.db.files.some((f) => f.name === "sidebar.tsx" && f.additions === 3 && f.deletions === 1)).toBe(true)
    expect(snap.db.files.some((f) => f.name === "scratch.md")).toBe(false)
    expect(delegatesForSession(snap, "ses_main")).toEqual([])
    assertPrivacy({ tools: snap.db.tools, files: snap.db.files, recent: snap.db.recent })
  })
})

describe("foreign boulder parent", () => {
  test("Session tab does not inherit another run's tasks", () => {
    projFix = createFixtureProject({
      boulder: boulderWithTask({ taskSessionId: "ses_foreign" }),
    })
    dbFix = createFixtureDb({
      sessions: [
        { id: "ses_current", project_id: "proj_a", title: "new main", parent_id: null, time_updated: NOW },
        {
          id: "ses_foreign",
          project_id: "proj_a",
          title: "old worker",
          parent_id: "ses_other_main",
          time_updated: NOW - 1_000,
        },
        { id: "ses_other_main", project_id: "proj_a", title: "old main", parent_id: null, time_updated: NOW - 2_000 },
      ],
    })
    expect(readOmo(projFix.root).present).toBe(true)
    const snap = readLiveSnapshot({
      sessionId: "ses_current",
      projectRoot: projFix.root,
      dbPath: dbFix.dbPath,
      force: true,
    })
    expect(snap.delegates.some((d) => d.sessionId === "ses_foreign")).toBe(true)
    expect(delegatesForSession(snap, "ses_current")).toEqual([])
  })
})

describe("finished child vs leftover boulder running", () => {
  test("Session and Project tabs drop the spinner once SQLite is idle", () => {
    projFix = createFixtureProject({
      boulder: boulderWithTask({
        taskSessionId: "ses_child",
        title: "Utworzyć EmailMessageBuilder",
        agent: "oracle",
        status: "running",
      }),
    })
    dbFix = createFixtureDb({
      sessions: [
        {
          id: "ses_main",
          project_id: "proj_a",
          title: "Email message builder",
          parent_id: null,
          agent: "Atlas - Plan Executor",
          time_updated: NOW - 25 * 60_000,
        },
        {
          id: "ses_child",
          project_id: "proj_a",
          title: "F1 plan-compliance review",
          parent_id: "ses_main",
          agent: "oracle",
          tokens_input: 80_000,
          tokens_output: 20_000,
          time_updated: NOW - 30 * 60_000,
        },
      ],
    })
    const snap = readLiveSnapshot({
      sessionId: "ses_main",
      projectRoot: projFix.root,
      dbPath: dbFix.dbPath,
      force: true,
    })
    const d = snap.delegates.find((x) => x.sessionId === "ses_child")
    expect(d?.status).toBe("completed")
    expect(d?.archived).toBe(false)
    const current = delegatesForSession(snap, "ses_main")
    expect(current).toHaveLength(1)
    expect(current[0]?.status).toBe("completed")
  })
})

describe("boulder schema v2 views", () => {
  test("works list the runs, boulder mirrors the active one, nothing leaks", () => {
    projFix = createFixtureProject({
      boulder: {
        schema_version: 2,
        active_work_id: "work_now",
        plan_name: "refactor-auth",
        status: "active",
        agent: "atlas",
        works: {
          work_done: {
            plan_name: "refactor-auth",
            status: "completed",
            updated_at: NOW - 86_400_000,
            session_ids: ["opencode:ses_old_main"],
          },
          work_now: {
            plan_name: "refactor-auth",
            status: "active",
            agent: "atlas",
            elapsed_ms: 720_000,
            updated_at: NOW,
            session_ids: ["opencode:ses_main", "ses_child"],
            session_origins: { "opencode:ses_main": "direct", ses_child: "appended" },
            task_sessions: {
              "todo:1": { task_title: "scaffold", status: "completed" },
              "todo:3": {
                task_label: "todo:3",
                task_title: "wire session jump",
                session_id: "opencode:ses_child",
                agent: "junior",
                category: "implement",
                status: "running",
                started_at: NOW - 4_000,
              },
            },
          },
        },
      },
    })
    dbFix = createFixtureDb({
      sessions: [
        { id: "ses_main", project_id: "proj_a", title: "main", parent_id: null, time_updated: NOW },
        {
          id: "ses_child",
          project_id: "proj_a",
          title: "wire session jump",
          parent_id: "ses_main",
          agent: "junior",
          time_updated: NOW - 2_000,
        },
      ],
    })
    const snap = readLiveSnapshot({
      sessionId: "ses_main",
      projectRoot: projFix.root,
      dbPath: dbFix.dbPath,
      force: true,
    })

    // Same plan run twice stays two rows; the root mirror is not a third.
    expect(snap.omo.works.map((w) => w.workId)).toEqual(["work_now", "work_done"])
    expect(snap.omo.works[0]?.current).toBe(true)

    const b = snap.omo.boulder
    expect(b.workId).toBe("work_now")
    expect(b.agent).toBe("atlas")
    expect(b.elapsedMs).toBe(720_000)
    expect(b.sessions.map((s) => `${s.id}:${s.origin}`)).toEqual([
      "ses_main:direct",
      "ses_child:appended",
    ])
    expect(b.counts).toEqual({ running: 1, done: 1, other: 0, total: 2 })

    // Delegates keep working off the same tasks.
    expect(delegatesForSession(snap, "ses_main").map((d) => d.sessionId)).toContain("ses_child")

    assertPrivacy({ works: snap.omo.works, boulder: snap.omo.boulder })
  })
})

describe("tools and files views", () => {
  test("labels and +/- without leaking bodies or full paths", () => {
    dbFix = createFixtureDb({
      sessions: [{ id: "ses_main", project_id: "proj_a", title: "main", time_updated: NOW }],
      parts: [
        {
          id: "prt_1",
          session_id: "ses_main",
          time_created: NOW,
          data: toolPartData({ tool: "bash", command: "ls src", pad: false }),
        },
        {
          id: "prt_2",
          session_id: "ses_main",
          time_created: NOW - 1,
          data: toolPartData({
            tool: "edit",
            filePath: "src/oes.ts",
            additions: 4,
            deletions: 2,
            pad: false,
          }),
        },
        {
          id: "prt_3",
          session_id: "ses_main",
          time_created: NOW - 2,
          data: patchPartData(["src/chrome.tsx"]),
        },
      ],
    })
    const handle = openReadonlyDb(dbFix.dbPath)
    expect(handle).toBeTruthy()
    const tools = listToolEvents(handle!, "ses_main")
    const files = listSessionFiles(handle!, "ses_main")
    expect(tools.some((t) => t.name === "ls src")).toBe(true)
    const edit = files.find((f) => f.name === "oes.ts")
    expect(edit?.additions).toBe(4)
    expect(edit?.deletions).toBe(2)
    expect(files.some((f) => f.name === "chrome.tsx")).toBe(true)
    for (const f of files) {
      expect(f.name.includes("/")).toBe(false)
      expect(f.name.includes("\\")).toBe(false)
    }
    assertPrivacy({ tools, files: files.map(({ name, additions, deletions, touch, letter }) => ({ name, additions, deletions, touch, letter })) })
  })
})
