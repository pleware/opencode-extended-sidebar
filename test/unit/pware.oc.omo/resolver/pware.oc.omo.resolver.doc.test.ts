import { afterAll, afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { listOmoFiles, resetDocsCache } from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.doc.js"
import { DraftFile } from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.draftFile.js"
import { NotepadFile } from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.notepadsFile.js"
import { ProofFile } from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.proofFile.js"
import { PlanFile } from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.planFile.js"
import { openReadonlyDb } from "../../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { createFixtureProject, type FixtureProject } from "../../../helpers/project.js"
import { createFixtureDb, toolPartData, type FixtureDb } from "../../../helpers/sqlite.js"
import { assertPrivacy } from "../../../helpers/privacy.js"

const held: FixtureProject[] = []
const dbs: FixtureDb[] = []

afterEach(() => {
  for (const p of held.splice(0)) p.dispose()
})

afterAll(() => {
  for (const db of dbs.splice(0)) db.dispose()
})

function project(files: Record<string, string>, mtimes: Record<string, number> = {}): string {
  const proj = createFixtureProject({ files, mtimes })
  held.push(proj)
  return proj.root
}

const names = (docs: readonly { name: string }[]) => docs.map((d) => d.name)

describe("listOmoFiles", () => {
  test("no project and no .omo are both empty, not a throw", () => {
    expect(listOmoFiles("draft", null)).toEqual([])
    resetDocsCache()
    expect(listOmoFiles("draft", project({ "README.md": "hi" }))).toEqual([])
  })

  test("lists each kind from its own directory", () => {
    const root = project({
      ".omo/plans/refactor.md": "plan",
      ".omo/drafts/auth-v2.md": "draft",
      ".omo/notepads/learnings.md": "notes",
      ".omo/evidence/login-fix/terminal.md": "proof",
    })
    expect(names(listOmoFiles("plan", root))).toEqual(["refactor.md"])
    expect(names(listOmoFiles("draft", root))).toEqual(["auth-v2.md"])
    expect(names(listOmoFiles("notepad", root))).toEqual(["learnings.md"])
    expect(names(listOmoFiles("proof", root))).toEqual(["login-fix/terminal.md"])
  })

  test("newest first inside a kind", () => {
    const base = Date.now() - 100_000
    const root = project(
      {
        ".omo/notepads/old.md": "a",
        ".omo/notepads/new.md": "b",
        ".omo/notepads/mid.md": "c",
      },
      {
        ".omo/notepads/old.md": base,
        ".omo/notepads/mid.md": base + 10_000,
        ".omo/notepads/new.md": base + 20_000,
      },
    )
    expect(names(listOmoFiles("notepad", root))).toEqual(["new.md", "mid.md", "old.md"])
  })

  test("sort by name and a limit cap", () => {
    const root = project({
      ".omo/drafts/b.md": "b",
      ".omo/drafts/a.md": "a",
      ".omo/drafts/c.md": "c",
    })
    expect(names(listOmoFiles("draft", root, { sort: "name" }))).toEqual(["a.md", "b.md", "c.md"])
    expect(names(listOmoFiles("draft", root, { sort: "name", limit: 2 }))).toEqual(["a.md", "b.md"])
  })

  test("hidden files are skipped and nesting stops at the evidence change folder", () => {
    const root = project({
      ".omo/drafts/.hidden.md": "no",
      ".omo/drafts/real.md": "yes",
      ".omo/evidence/fix/deep/too-far.md": "no",
      ".omo/evidence/fix/kept.md": "yes",
    })
    expect(names(listOmoFiles("draft", root))).toEqual(["real.md"])
    expect(names(listOmoFiles("proof", root))).toEqual(["fix/kept.md"])
  })

  test("paths stay project-relative — nothing absolute reaches the panel", () => {
    const root = project({ ".omo/drafts/auth.md": "draft" })
    const docs = listOmoFiles("draft", root)
    expect(docs.length).toBeGreaterThan(0)
    for (const d of docs) expect(path.isAbsolute(d.rel)).toBe(false)
    assertPrivacy({ docs })
  })

  test("the legacy .sisyphus directory is read too", () => {
    const root = project({ ".sisyphus/notepads/learnings.md": "notes" })
    expect(names(listOmoFiles("notepad", root))).toEqual(["learnings.md"])
  })

  test("a draft whose slug exists as a plan is superseded and hidden from the draft list", () => {
    const root = project({
      ".omo/plans/foo.md": "plan",
      ".omo/drafts/foo.md": "draft",
      ".omo/drafts/bar.md": "draft",
    })
    expect(names(listOmoFiles("plan", root))).toEqual(["foo.md"])
    expect(names(listOmoFiles("draft", root))).toEqual(["bar.md"])
  })

  test("a legacy .sisyphus draft is superseded by a plan with the same slug under .omo", () => {
    const root = project({
      ".omo/plans/foo.md": "plan",
      ".sisyphus/drafts/foo.md": "draft",
    })
    expect(listOmoFiles("draft", root)).toEqual([])
  })

  test("a draft with no matching plan stays visible", () => {
    const root = project({
      ".omo/plans/foo.md": "plan",
      ".omo/drafts/bar.md": "draft",
    })
    expect(names(listOmoFiles("draft", root))).toEqual(["bar.md"])
  })
})

describe("per-kind list wrappers", () => {
  test("each resolver lists its own directory", () => {
    const root = project({
      ".omo/plans/p.md": "plan",
      ".omo/drafts/d.md": "draft",
      ".omo/notepads/n.md": "note",
      ".omo/evidence/c/e.md": "proof",
    })
    expect(names(PlanFile.list(root))).toEqual(["p.md"])
    expect(names(DraftFile.list(root))).toEqual(["d.md"])
    expect(names(NotepadFile.list(root))).toEqual(["n.md"])
    expect(names(ProofFile.list(root))).toEqual(["c/e.md"])
  })

  test("DraftFile.list filters to the writer session when given a db", () => {
    const root = project({ ".omo/drafts/a.md": "a", ".omo/drafts/b.md": "b" })
    const t0 = 2_100_000_000_000
    const fix = createFixtureDb({
      sessions: [{ id: "ses_writer", project_id: "proj_1", time_updated: t0 + 900 }],
      parts: [
        {
          id: "p_a",
          session_id: "ses_writer",
          time_created: t0 + 50,
          data: toolPartData({
            tool: "write",
            filePath: "D:/proj/.omo/drafts/a.md",
            start: t0 + 50,
            end: t0 + 50,
            callID: "call_a",
          }),
        },
      ],
    })
    dbs.push(fix)
    const db = openReadonlyDb(fix.dbPath)!
    expect(names(DraftFile.list(root, "ses_writer", { db }))).toEqual(["a.md"])
    expect(names(DraftFile.list(root, "other", { db }))).toEqual([])
  })

  test("status filter reconciles frontmatter against boulder work state", () => {
    const proj = createFixtureProject({
      files: {
        ".omo/plans/approved.md": "---\nstatus: approved\n---\nplan",
        ".omo/plans/done.md": "---\nstatus: done\n---\nplan",
        ".omo/plans/stale.md": "---\nstatus: approved\n---\nplan",
      },
      boulder: {
        works: {
          work_stale: { plan_name: "stale", status: "completed", updated_at: 1_000 },
        },
      },
    })
    held.push(proj)
    const root = proj.root

    expect(names(listOmoFiles("plan", root, { status: "approved" }))).toEqual(["approved.md"])
    expect(names(listOmoFiles("plan", root, { status: "done" })).sort()).toEqual([
      "done.md",
      "stale.md",
    ])
    expect(names(listOmoFiles("plan", root, { status: "drafting" }))).toEqual([])
    expect(names(listOmoFiles("plan", root))).toHaveLength(3)
  })
})
