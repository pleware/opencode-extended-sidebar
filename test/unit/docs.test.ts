import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { groupDocs, readOmoDocs, resetDocsCache, type DocView } from "../../src/docs.js"
import { createFixtureProject, type FixtureProject } from "../helpers/project.js"
import { assertPrivacy } from "../helpers/privacy.js"

const held: FixtureProject[] = []

afterEach(() => {
  for (const p of held.splice(0)) p.dispose()
})

function project(files: Record<string, string>, mtimes: Record<string, number> = {}): string {
  const proj = createFixtureProject({ files, mtimes })
  held.push(proj)
  return proj.root
}

const names = (docs: readonly DocView[], kind: string) =>
  docs.filter((d) => d.kind === kind).map((d) => d.name)

describe("readOmoDocs", () => {
  test("no project and no .omo are both an empty list, not a throw", () => {
    expect(readOmoDocs(null)).toEqual([])
    resetDocsCache()
    expect(readOmoDocs(project({ "README.md": "hi" }))).toEqual([])
  })

  test("collects drafts, notepads and evidence with their kinds", () => {
    const root = project({
      ".omo/drafts/auth-v2.md": "draft",
      ".omo/notepads/learnings.md": "notes",
      ".omo/notepads/decisions.md": "notes",
      ".omo/evidence/login-fix/terminal.md": "proof",
      ".omo/evidence/login-fix/shot.png": "binary",
    })
    const docs = readOmoDocs(root)
    expect(names(docs, "draft")).toEqual(["auth-v2.md"])
    expect(names(docs, "notepad").sort()).toEqual(["decisions.md", "learnings.md"])
    expect(names(docs, "proof").sort()).toEqual(["login-fix/shot.png", "login-fix/terminal.md"])
  })

  test("the plan comes from the works, not from a directory guess", () => {
    const root = project({ "plans/refactor-auth.md": "- [ ] one" })
    const docs = readOmoDocs(root, ["plans/refactor-auth.md"])
    expect(names(docs, "plan")).toEqual(["refactor-auth.md"])
    expect(docs[0]?.rel).toBe("plans/refactor-auth.md")
  })

  test("a plan path that no longer exists is dropped", () => {
    const root = project({ ".omo/boulder.json": "{}" })
    expect(readOmoDocs(root, ["plans/gone.md"])).toEqual([])
  })

  test("previewable follows the extension — a screenshot is not text", () => {
    const root = project({
      ".omo/evidence/fix/notes.md": "text",
      ".omo/evidence/fix/shot.png": "binary",
    })
    const docs = readOmoDocs(root)
    expect(docs.find((d) => d.name.endsWith("notes.md"))?.previewable).toBe(true)
    expect(docs.find((d) => d.name.endsWith("shot.png"))?.previewable).toBe(false)
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
    expect(names(readOmoDocs(root), "notepad")).toEqual(["new.md", "mid.md", "old.md"])
  })

  test("hidden files are skipped and nesting stops at the evidence change folder", () => {
    const root = project({
      ".omo/drafts/.hidden.md": "no",
      ".omo/drafts/real.md": "yes",
      ".omo/evidence/fix/deep/too-far.md": "no",
      ".omo/evidence/fix/kept.md": "yes",
    })
    const docs = readOmoDocs(root)
    expect(names(docs, "draft")).toEqual(["real.md"])
    expect(names(docs, "proof")).toEqual(["fix/kept.md"])
  })

  test("paths stay project-relative — nothing absolute reaches the panel", () => {
    const root = project({
      ".omo/drafts/auth.md": "draft",
      ".omo/evidence/fix/terminal.md": "proof",
    })
    const docs = readOmoDocs(root)
    expect(docs.length).toBeGreaterThan(0)
    for (const d of docs) expect(path.isAbsolute(d.rel)).toBe(false)
    assertPrivacy({ docs })
  })

  test("the legacy .sisyphus directory is read too", () => {
    const root = project({ ".sisyphus/notepads/learnings.md": "notes" })
    expect(names(readOmoDocs(root), "notepad")).toEqual(["learnings.md"])
  })
})

describe("groupDocs", () => {
  test("keeps display order and drops empty kinds", () => {
    const root = project({
      ".omo/notepads/learnings.md": "n",
      ".omo/evidence/fix/proof.md": "p",
    })
    const groups = groupDocs(readOmoDocs(root))
    expect(groups.map((g) => g.kind)).toEqual(["notepad", "proof"])
    expect(groups[0]?.items.length).toBe(1)
  })

  test("plan sorts ahead of drafts, notepads and proof", () => {
    const root = project({
      "plans/p.md": "plan",
      ".omo/drafts/d.md": "draft",
      ".omo/notepads/n.md": "note",
      ".omo/evidence/c/e.md": "proof",
    })
    const groups = groupDocs(readOmoDocs(root, ["plans/p.md"]))
    expect(groups.map((g) => g.kind)).toEqual(["plan", "draft", "notepad", "proof"])
  })

  test("an empty index is an empty grouping", () => {
    expect(groupDocs([])).toEqual([])
  })
})
