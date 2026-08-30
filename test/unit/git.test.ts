import { afterEach, describe, expect, test } from "bun:test"
import {
  parsePorcelainZ,
  readGitMarksFor,
  relToGitRoot,
  resetGitCache,
} from "../../src/git.js"

afterEach(() => {
  resetGitCache()
})

describe("parsePorcelainZ", () => {
  test("modified, untracked, rename", () => {
    const buf = [" M src/git.ts", "?? tmp/x.md", "R  src/old.ts", "src/new.ts"].join("\0") + "\0"
    const marks = parsePorcelainZ(buf)
    expect(marks.get("src/git.ts")).toBe("M")
    expect(marks.get("tmp/x.md")).toBe("?")
    expect(marks.get("src/old.ts")).toBe("R")
  })
})

describe("relToGitRoot", () => {
  test("strips the git root prefix", () => {
    expect(relToGitRoot("D:/work/app/src/a.ts", "D:/work/app")).toBe("src/a.ts")
  })
})

describe("readGitMarksFor", () => {
  test("no repo → empty, no spawn", () => {
    const { root, marks } = readGitMarksFor(["src/a.ts"], null)
    expect(root).toBeNull()
    expect(marks.size).toBe(0)
  })
  test("does not block the caller while git runs", () => {
    const t0 = performance.now()
    readGitMarksFor(["src/git.ts"], process.cwd())
    expect(performance.now() - t0).toBeLessThan(50)
  })
})
