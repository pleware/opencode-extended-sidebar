import { describe, expect, test } from "bun:test"
import { ignoredByGitignore, ignoredByOesignore } from "../../../../src/pware.oc.core/git/pware.oc.core.gitignore.js"
import { createFixtureProject } from "../../../helpers/project.js"

describe("ignoredByGitignore", () => {
  test("comments, negation, dir-only, glob", () => {
    const proj = createFixtureProject({
      gitignore: ["# noise", "dist/", "*.log", "!keep.log", "**/*.tmp"].join("\n"),
    })
    try {
      const root = proj.root
      expect(ignoredByGitignore("src/a.ts", root)).toBe(false)
      expect(ignoredByGitignore("dist/out.js", root)).toBe(true)
      expect(ignoredByGitignore("notes.log", root)).toBe(true)
      expect(ignoredByGitignore("keep.log", root)).toBe(false)
      expect(ignoredByGitignore("src/x.tmp", root)).toBe(true)
    } finally {
      proj.dispose()
    }
  })
  test("missing root is never ignored", () => {
    expect(ignoredByGitignore("src/a.ts", null)).toBe(false)
  })
  test("absolute path under the root is relativized", () => {
    const proj = createFixtureProject({ gitignore: "dist/\n" })
    try {
      const abs = `${proj.root.replace(/\\/g, "/")}/dist/out.js`
      expect(ignoredByGitignore(abs, proj.root)).toBe(true)
    } finally {
      proj.dispose()
    }
  })
})

describe("ignoredByOesignore", () => {
  test("dir-only, basename glob, and negation", () => {
    const proj = createFixtureProject({
      oesignore: ["tmp/", ".hidden/", "*.json", "!keep.json"].join("\n"),
    })
    try {
      const root = proj.root
      expect(ignoredByOesignore("tmp/out.js", root)).toBe(true)
      expect(ignoredByOesignore("a/b/.hidden/x.md", root)).toBe(true)
      expect(ignoredByOesignore("package.json", root)).toBe(true)
      expect(ignoredByOesignore("src/data.json", root)).toBe(true)
      expect(ignoredByOesignore("keep.json", root)).toBe(false)
      expect(ignoredByOesignore("src/a.ts", root)).toBe(false)
    } finally {
      proj.dispose()
    }
  })
  test("no .oesignore file ignores nothing", () => {
    const proj = createFixtureProject()
    try {
      expect(ignoredByOesignore("tmp/out.js", proj.root)).toBe(false)
    } finally {
      proj.dispose()
    }
  })
  test("missing root is never ignored", () => {
    expect(ignoredByOesignore("tmp/out.js", null)).toBe(false)
  })
})
