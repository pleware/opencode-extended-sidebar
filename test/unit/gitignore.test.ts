import { describe, expect, test } from "bun:test"
import { ignoredByGitignore } from "../../src/gitignore.js"
import { createFixtureProject } from "../helpers/project.js"

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
})
