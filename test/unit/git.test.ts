import { afterEach, describe, expect, test } from "bun:test"
import {
  parsePorcelainZ,
  readGitMarksFor,
  relsFrom,
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

describe("relsFrom", () => {
  test("drops outside-repo paths and the root itself — git aborts on them", () => {
    const root = "D:/work/app"
    const rels = relsFrom(
      [
        "D:/work/app/src/a.ts",
        "C:/Users/x/AppData/Local/Temp/probe.ts",
        "D:/work/app",
        "D:/work/app/README.md",
      ],
      root,
    )
    expect(rels).toEqual(["src/a.ts", "readme.md"])
  })

  test("dedupes and caps at GIT_PATH_CAP", () => {
    const many = Array.from({ length: 50 }, (_, i) => `D:/work/app/src/f${i}.ts`)
    const rels = relsFrom([...many, "D:/work/app/src/f0.ts"], "D:/work/app")
    expect(rels.length).toBe(40)
    expect(new Set(rels).size).toBe(rels.length)
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
