import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  findGitRoot,
  gitLetterFor,
  gitStatusStamp,
  onGitMarksChange,
  parsePorcelainZ,
  readGitMarksFor,
  relsFrom,
  relToGitRoot,
  resetGitCache,
} from "../../../../src/pware.oc.core/git/pware.oc.core.git.js"

afterEach(() => {
  resetGitCache()
})

/** Temp git repo with a single untracked file → deterministic `?? probe.txt`. */
function makeRepo(): { root: string; abs: string; dispose: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oes-git-"))
  spawnSync("git", ["init", "-q", root])
  const abs = path.join(root, "probe.txt")
  fs.writeFileSync(abs, "hello")
  return {
    root,
    abs,
    dispose: () => {
      try {
        fs.rmSync(root, { recursive: true, force: true })
      } catch {
        // already gone
      }
    },
  }
}

/** Resolve once the async git status lands and calls listeners. */
function waitForNotify(): { done: Promise<void>; unsub: () => void } {
  let resolve!: () => void
  const done = new Promise<void>((r) => {
    resolve = r
  })
  const unsub = onGitMarksChange(() => resolve())
  return { done, unsub }
}

describe("parsePorcelainZ", () => {
  test("modified, untracked, rename", () => {
    const buf = [" M src/git.ts", "?? tmp/x.md", "R  src/old.ts", "src/new.ts"].join("\0") + "\0"
    const marks = parsePorcelainZ(buf)
    expect(marks.get("src/git.ts")).toBe("M")
    expect(marks.get("tmp/x.md")).toBe("?")
    expect(marks.get("src/old.ts")).toBe("R")
  })

  test("drops ignored entries and maps unmerged/conflict states", () => {
    const buf = ["!! ignored.md", "UU both.ts", "DD gone.ts", "AA added.ts", " C copied.ts"].join("\0") + "\0"
    const marks = parsePorcelainZ(buf)
    expect(marks.has("ignored.md")).toBe(false)
    expect(marks.get("both.ts")).toBe("U")
    expect(marks.get("gone.ts")).toBe("U")
    expect(marks.get("added.ts")).toBe("U")
    expect(marks.get("copied.ts")).toBe("C")
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

describe("findGitRoot", () => {
  test("walks up to the repo root from a nested path", () => {
    const nested = path.join(process.cwd(), "src", "pware.oc.core", "git")
    expect(findGitRoot(nested)).toBe(path.resolve(process.cwd()))
  })

  test("returns null when no .git exists up the tree", () => {
    const outside = path.join(os.tmpdir(), "oes-no-git", "a", "b", "c")
    expect(findGitRoot(outside)).toBeNull()
  })
})

describe("gitStatusStamp", () => {
  test("returns 0 when there is no repo", () => {
    expect(gitStatusStamp(null)).toBe("0")
    expect(gitStatusStamp(path.join(os.tmpdir(), "oes-no-git-stamp"))).toBe("0")
  })

  test("returns a three-part stamp for a real repo", () => {
    const stamp = gitStatusStamp(process.cwd())
    expect(stamp).toContain("|")
    expect(stamp).not.toBe("0")
  })
})

describe("onGitMarksChange", () => {
  test("registers a listener and unsubscribes it", () => {
    const fn = () => {}
    const unsub = onGitMarksChange(fn)
    expect(() => unsub()).not.toThrow()
    expect(() => unsub()).not.toThrow()
  })
})

describe("readGitMarksFor / runGit / gitLetterFor", () => {
  test("no repo → empty, no spawn", () => {
    const { root, marks } = readGitMarksFor(["src/a.ts"], null)
    expect(root).toBeNull()
    expect(marks.size).toBe(0)
  })

  test("all paths outside the repo → empty, no spawn", () => {
    const repo = makeRepo()
    try {
      const { root, marks } = readGitMarksFor(["C:/outside/file.ts"], repo.root)
      expect(root).not.toBeNull()
      expect(marks.size).toBe(0)
    } finally {
      repo.dispose()
    }
  })

  test("does not block the caller while git runs", () => {
    const t0 = performance.now()
    readGitMarksFor(["src/git.ts"], process.cwd())
    expect(performance.now() - t0).toBeLessThan(50)
  })

  test("spawns git, parses an untracked file, notifies, caches, and resolves letters", async () => {
    const repo = makeRepo()
    const unsubs: Array<() => void> = []
    try {
      const { done, unsub } = waitForNotify()
      unsubs.push(unsub)
      // a throwing listener exercises notify()'s catch (sidebar teardown)
      unsubs.push(
        onGitMarksChange(() => {
          throw new Error("teardown")
        }),
      )

      const first = readGitMarksFor([repo.abs], repo.root)
      expect(first.root).not.toBeNull()
      expect(first.marks.size).toBe(0)

      // a second call before git returns hits the in-flight pending-key branch
      const second = readGitMarksFor([repo.abs], repo.root)
      expect(second.marks.size).toBe(0)

      await done

      // cache hit — the stamp is unchanged, so the parsed marks come back
      const third = readGitMarksFor([repo.abs], repo.root)
      expect(third.marks.get("probe.txt")).toBe("?")

      expect(gitLetterFor(repo.abs, repo.root)).toBe("?")
    } finally {
      for (const unsub of unsubs) unsub()
      repo.dispose()
    }
  })

  test("debounces repeated status on the same paths within the window", async () => {
    const repo = makeRepo()
    try {
      const { done, unsub } = waitForNotify()
      readGitMarksFor([repo.abs], repo.root)
      await done
      unsub()

      // bump .git/HEAD so the stamp changes → cache miss → debounce branch
      const head = path.join(repo.root, ".git", "HEAD")
      const now = new Date()
      fs.utimesSync(head, now, now)

      const again = readGitMarksFor([repo.abs], repo.root)
      expect(again.marks.get("probe.txt")).toBe("?")
    } finally {
      repo.dispose()
    }
  })

  test("times out a hung git and soft-fails without blocking the caller", async () => {
    const repo = makeRepo()
    const fakeDir = fs.mkdtempSync(path.join(os.tmpdir(), "oes-fakegit-"))
    const prevPath = process.env.PATH
    try {
      fs.writeFileSync(path.join(fakeDir, "git.cmd"), "@echo off\r\nping -n 5 127.0.0.1 > nul\r\n")
      process.env.PATH = fakeDir + path.delimiter + prevPath
      readGitMarksFor([repo.abs], repo.root)
      // wait past GIT_TIMEOUT_MS (1500) so the kill timer fires
      await new Promise((r) => setTimeout(r, 2000))
      const { marks } = readGitMarksFor([repo.abs], repo.root)
      expect(marks.size).toBe(0)
    } finally {
      process.env.PATH = prevPath
      repo.dispose()
      fs.rmSync(fakeDir, { recursive: true, force: true })
    }
  })
})

describe("gitLetterFor", () => {
  test("returns null without a repo", () => {
    expect(gitLetterFor("src/a.ts", null)).toBeNull()
  })
})
