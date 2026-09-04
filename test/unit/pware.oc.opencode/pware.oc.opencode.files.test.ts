import { describe, expect, test } from "bun:test"
import {
  basenameOf,
  decorateFiles,
  fileFilter,
  fileHitFromExtracted,
  fileHitFromPartData,
  filePathFromPartData,
  filesFromEvent,
  filesFromPatchData,
  filesFromPatchJson,
  formatDiffStat,
  mergeFiles,
  shortFileName,
  sumDiff,
  FILE_TOUCH_READ,
  FILE_TOUCH_WRITE,
  type FileView,
} from "../../../src/pware.oc.opencode/pware.oc.opencode.files.js"
import { resetGitCache } from "../../../src/pware.oc.core/git/pware.oc.core.git.js"

describe("basenameOf / shortFileName / formatDiffStat", () => {
  test("basename strips directories", () => {
    expect(basenameOf("src/sidebar.tsx")).toBe("sidebar.tsx")
    expect(basenameOf("C:\\work\\tmp\\out.json")).toBe("out.json")
  })
  test("long names keep stem ends and extension", () => {
    const s = shortFileName("deepseek-v4-pro-preview.ts", 16)
    expect(s).toContain("…")
    expect(s.endsWith(".ts")).toBe(true)
    expect(s.length).toBeLessThanOrEqual(16)
  })
  test("diff stat", () => {
    expect(formatDiffStat(3, 1)).toBe("+3 −1")
    expect(formatDiffStat(0, 0)).toBe("")
  })
})

describe("patch / part parse (regex helpers)", () => {
  test("filesFromPatchData takes paths only", () => {
    const data = JSON.stringify({ type: "patch", files: ["src/a.ts", "tmp/x.ts"] })
    const files = filesFromPatchData(data, 1)
    expect(files.map((f) => f.name)).toEqual(["a.ts", "x.ts"])
  })
  test("fileHitFromPartData uses edit metadata +/-", () => {
    const data = JSON.stringify({
      type: "tool",
      tool: "edit",
      filePath: "src/oes.ts",
      additions: 4,
      deletions: 2,
    })
    const hit = fileHitFromPartData(data, 1)
    expect(hit?.name).toBe("oes.ts")
    expect(hit?.additions).toBe(4)
    expect(hit?.deletions).toBe(2)
  })
  test("fileHitFromExtracted uses columns, not the blob", () => {
    const hit = fileHitFromExtracted({
      tool: "edit",
      filePath: "src/oes.ts",
      additions: 4,
      deletions: 2,
      at: 1,
    })
    expect(hit?.name).toBe("oes.ts")
    expect(hit?.additions).toBe(4)
  })
})

describe("fileFilter", () => {
  test("defaults skipGitignore off with a null project root", () => {
    expect(fileFilter(null)).toEqual({ skipGitignore: false, projectRoot: null })
    expect(fileFilter(undefined)).toEqual({ skipGitignore: false, projectRoot: null })
  })
  test("carries an explicit project root", () => {
    expect(fileFilter("D:/proj")).toEqual({ skipGitignore: false, projectRoot: "D:/proj" })
  })
})

describe("filesFromEvent", () => {
  test("returns empty for null / non-object input", () => {
    expect(filesFromEvent(null, "ses")).toEqual([])
    expect(filesFromEvent(undefined, "ses")).toEqual([])
    expect(filesFromEvent("tool.called", "ses")).toEqual([])
  })

  test("returns empty when the session id mismatches", () => {
    const evt = {
      type: "session.diff",
      sessionID: "other",
      properties: { diff: [{ file: "src/a.ts" }] },
    }
    expect(filesFromEvent(evt, "mine")).toEqual([])
  })

  test("returns empty for a non-file/tool/db-refresh kind", () => {
    const evt = { type: "session.next.text.delta", properties: { text: "hi" } }
    expect(filesFromEvent(evt, "ses")).toEqual([])
  })

  test("session.diff rows become files with diff stats", () => {
    const evt = {
      type: "session.diff",
      properties: {
        diff: [
          { file: "src/a.ts", additions: 3, deletions: 1 },
          { filePath: "tmp/x.ts", added: 2, removed: 0 },
          { path: "docs/readme.md" },
          null,
          { tool: "edit" },
        ],
      },
    }
    const files = filesFromEvent(evt, "ses")
    expect(files.map((f) => f.name)).toEqual(["a.ts", "x.ts", "readme.md"])
    expect(files[0]).toMatchObject({ additions: 3, deletions: 1 })
    expect(files[1]).toMatchObject({ additions: 2, deletions: 0 })
    expect(files.every((f) => f.letter === null)).toBe(true)
  })

  test("a bare bag.diff array triggers the diff branch without the type", () => {
    const evt = { type: "session.idle", properties: { diff: [{ file: "src/b.ts" }] } }
    const files = filesFromEvent(evt, "ses")
    expect(files.map((f) => f.name)).toEqual(["b.ts"])
  })

  test("file.edited emits one file", () => {
    const evt = { type: "file.edited", properties: { file: "src/sidebar.tsx" } }
    const files = filesFromEvent(evt, "ses")
    expect(files).toHaveLength(1)
    expect(files[0]?.name).toBe("sidebar.tsx")
  })

  test("file.edited with no path returns empty", () => {
    const evt = { type: "file.edited", properties: { tool: "edit" } }
    expect(filesFromEvent(evt, "ses")).toEqual([])
  })

  test("session.updated summary diffs become files", () => {
    const evt = {
      type: "session.updated",
      properties: {
        info: {
          summary: { diffs: [{ file: "src/a.ts", additions: 5 }, { filePath: "tmp/y.ts" }] },
        },
      },
    }
    const files = filesFromEvent(evt, "ses")
    expect(files.map((f) => f.name)).toEqual(["a.ts", "y.ts"])
    expect(files[0]?.additions).toBe(5)
  })

  test("session.created with no summary returns empty", () => {
    const evt = { type: "session.created", properties: { info: {} } }
    expect(filesFromEvent(evt, "ses")).toEqual([])
  })

  test("tool.called maps input file with metadata stats", () => {
    const evt = {
      type: "tool.called",
      properties: {
        tool: "edit",
        input: { filePath: "src/a.ts" },
        metadata: { additions: 4, deletions: 2 },
      },
    }
    const files = filesFromEvent(evt, "ses")
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      name: "a.ts",
      additions: 4,
      deletions: 2,
      touch: FILE_TOUCH_WRITE,
    })
  })

  test("tool.called reads a part object but bag-level input path", () => {
    const evt = {
      type: "tool.called",
      properties: {
        part: { tool: "write", metadata: { filediff: { additions: 7, deletions: 3 } } },
        input: { filePath: "src/b.ts" },
      },
    }
    const files = filesFromEvent(evt, "ses")
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      name: "b.ts",
      additions: 7,
      deletions: 3,
      touch: FILE_TOUCH_WRITE,
    })
  })

  test("tool.called read tool marks a read touch", () => {
    const evt = { type: "tool.called", properties: { tool: "read", input: { file: "src/x.ts" } } }
    const files = filesFromEvent(evt, "ses")
    expect(files).toHaveLength(1)
    expect(files[0]?.touch).toBe(FILE_TOUCH_READ)
  })

  test("tool.called falls back to part/bag path when input is missing", () => {
    const evt = { type: "tool.called", properties: { tool: "edit", filePath: "src/z.ts", additions: 9, deletions: 4 } }
    const files = filesFromEvent(evt, "ses")
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ name: "z.ts", additions: 9, deletions: 4 })
  })

  test("tool.called with a non-file tool returns empty", () => {
    const evt = { type: "tool.called", properties: { tool: "bash", input: { command: "ls" } } }
    expect(filesFromEvent(evt, "ses")).toEqual([])
  })

  test("tool.called with no resolvable path returns empty", () => {
    const evt = { type: "tool.called", properties: { tool: "edit", input: { command: "ls" } } }
    expect(filesFromEvent(evt, "ses")).toEqual([])
  })

  test("message.part.updated maps a tool part", () => {
    const evt = {
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "write", input: { filePath: "src/w.ts" } } },
    }
    const files = filesFromEvent(evt, "ses")
    expect(files).toHaveLength(1)
    expect(files[0]?.name).toBe("w.ts")
  })

  test("a db-refresh type with no file branch returns empty", () => {
    const evt = { type: "session.status", properties: { status: "idle" } }
    expect(filesFromEvent(evt, "ses")).toEqual([])
  })

  test("a flat event without properties uses the event itself as the bag", () => {
    const evt = { type: "tool.called", tool: "edit", input: { filePath: "src/flat.ts" } }
    const files = filesFromEvent(evt, "ses")
    expect(files).toHaveLength(1)
    expect(files[0]?.name).toBe("flat.ts")
  })
})

describe("filesFromPatchJson", () => {
  test("parses a JSON array of string paths", () => {
    const files = filesFromPatchJson('["src/a.ts","tmp/x.ts"]', 1)
    expect(files.map((f) => f.name)).toEqual(["a.ts", "x.ts"])
  })
  test("accepts an already-parsed array", () => {
    const files = filesFromPatchJson(["src/a.ts"], 1)
    expect(files.map((f) => f.name)).toEqual(["a.ts"])
  })
  test("object items use filePath then path", () => {
    const files = filesFromPatchJson([{ filePath: "src/a.ts" }, { path: "tmp/x.ts" }], 1)
    expect(files.map((f) => f.name)).toEqual(["a.ts", "x.ts"])
  })
  test("skips items without a path and drops dot-paths", () => {
    const files = filesFromPatchJson(["src/a.ts", ".", "..", {}, { name: "no" }, 42], 1)
    expect(files.map((f) => f.name)).toEqual(["a.ts"])
  })
  test("returns empty for invalid JSON text", () => {
    expect(filesFromPatchJson("{not json", 1)).toEqual([])
  })
  test("returns empty for blank text and non-array raw", () => {
    expect(filesFromPatchJson("   ", 1)).toEqual([])
    expect(filesFromPatchJson({ filePath: "src/a.ts" }, 1)).toEqual([])
    expect(filesFromPatchJson(42, 1)).toEqual([])
  })
})

describe("filePathFromPartData / unescape", () => {
  test("falls back to manual unescape on an invalid JSON escape", () => {
    const data = '{"tool":"edit","filePath":"C:\\q"}'
    expect(filePathFromPartData(data)).toBe("C:\\q")
  })
})

describe("fileHitFromExtracted fallbacks", () => {
  test("returns null when both path columns are absent", () => {
    expect(fileHitFromExtracted({ at: 1 })).toBeNull()
    expect(fileHitFromExtracted({ filePath: null, filePathAlt: null, at: 1 })).toBeNull()
  })
  test("prefers filePath over filePathAlt", () => {
    const hit = fileHitFromExtracted({ tool: "edit", filePath: "src/a.ts", filePathAlt: "tmp/x.ts", at: 1 })
    expect(hit?.name).toBe("a.ts")
  })
  test("falls back to filePathAlt and parses string stats", () => {
    const hit = fileHitFromExtracted({
      tool: "write",
      filePathAlt: "tmp/x.ts",
      additions: "4",
      deletions: "2",
      at: 1,
    })
    expect(hit?.name).toBe("x.ts")
    expect(hit?.additions).toBe(4)
    expect(hit?.deletions).toBe(2)
    expect(hit?.touch).toBe(FILE_TOUCH_WRITE)
  })
  test("rejects unknown tools and non-numeric stats fall back to zero", () => {
    expect(fileHitFromExtracted({ tool: "bash", filePath: "src/a.ts", at: 1 })).toBeNull()
    const hit = fileHitFromExtracted({ tool: "edit", filePath: "src/a.ts", additions: null, deletions: {}, at: 1 })
    expect(hit?.additions).toBe(0)
    expect(hit?.deletions).toBe(0)
  })
})

describe("filesFromPatchData guards", () => {
  test("ignores non-patch data", () => {
    expect(filesFromPatchData(JSON.stringify({ type: "text", text: "hi" }), 1)).toEqual([])
  })
  test("returns empty when the files block is missing", () => {
    expect(filesFromPatchData(JSON.stringify({ type: "patch", foo: 1 }), 1)).toEqual([])
  })
})

describe("decorateFiles", () => {
  const mk = (id: string, touch: FileView["touch"], letter: FileView["letter"]): FileView => ({
    id,
    name: basenameOf(id),
    additions: 0,
    deletions: 0,
    at: 1,
    touch,
    letter,
  })

  test("empty input passes through", () => {
    expect(decorateFiles([])).toEqual([])
  })

  test("git:false keeps existing letters and marks reads as V", () => {
    const out = decorateFiles(
      [
        mk("a.ts", FILE_TOUCH_READ, null),
        mk("b.ts", FILE_TOUCH_WRITE, null),
        mk("c.ts", FILE_TOUCH_WRITE, "M"),
      ],
      null,
      { git: false },
    )
    expect(out.map((f) => f.letter)).toEqual(["V", null, "M"])
  })

  test("no git root marks reads V and writes null", () => {
    const out = decorateFiles([mk("a.ts", FILE_TOUCH_READ, null), mk("b.ts", FILE_TOUCH_WRITE, null)], null)
    expect(out.map((f) => f.letter)).toEqual(["V", null])
  })

  test("with a git root consults git marks (cold cache)", () => {
    resetGitCache()
    const out = decorateFiles(
      [
        mk("src/pware.oc.opencode/pware.oc.opencode.files.ts", FILE_TOUCH_READ, null),
        mk("src/pware.oc.opencode/pware.oc.opencode.files.ts", FILE_TOUCH_WRITE, null),
      ],
      process.cwd(),
    )
    expect(out.map((f) => f.letter)).toEqual(["V", null])
  })
})

describe("sumDiff", () => {
  const mk = (additions: number, deletions: number): FileView => ({
    id: "f",
    name: "f",
    additions,
    deletions,
    at: 1,
    touch: FILE_TOUCH_WRITE,
    letter: null,
  })
  test("totals additions and deletions", () => {
    expect(sumDiff([mk(3, 1), mk(0, 5)])).toEqual({ additions: 3, deletions: 6 })
  })
  test("empty list totals zero", () => {
    expect(sumDiff([])).toEqual({ additions: 0, deletions: 0 })
  })
})

describe("mergeFiles", () => {
  test("merges db and live, live wins on max, sorted by at desc", () => {
    const fromDb: FileView[] = [
      { id: "a.ts", name: "a.ts", additions: 1, deletions: 1, at: 100, touch: FILE_TOUCH_WRITE, letter: "M" },
      { id: "b.ts", name: "b.ts", additions: 2, deletions: 2, at: 200, touch: FILE_TOUCH_READ, letter: null },
    ]
    const live: Record<string, FileView> = {
      "a.ts": { id: "a.ts", name: "a.ts", additions: 5, deletions: 0, at: 300, touch: FILE_TOUCH_READ, letter: null },
      "c.ts": { id: "c.ts", name: "c.ts", additions: 9, deletions: 4, at: 150, touch: FILE_TOUCH_WRITE, letter: null },
    }
    const out = mergeFiles(fromDb, live)
    expect(out.map((f) => f.id)).toEqual(["a.ts", "b.ts", "c.ts"])
    expect(out.find((f) => f.id === "a.ts")).toMatchObject({
      additions: 5,
      deletions: 1,
      at: 300,
      touch: FILE_TOUCH_WRITE,
      letter: "M",
    })
    expect(out.find((f) => f.id === "c.ts")).toMatchObject({
      additions: 9,
      deletions: 4,
      touch: FILE_TOUCH_WRITE,
      letter: null,
    })
  })

  test("handles null fromDb and empty live", () => {
    expect(mergeFiles(null, {})).toEqual([])
    expect(mergeFiles(undefined, {})).toEqual([])
  })

  test("read touch survives when neither side writes", () => {
    const fromDb: FileView[] = [
      { id: "r", name: "r", additions: 0, deletions: 0, at: 10, touch: FILE_TOUCH_READ, letter: null },
    ]
    const live: Record<string, FileView> = {
      r: { id: "r", name: "r", additions: 0, deletions: 0, at: 20, touch: FILE_TOUCH_READ, letter: null },
    }
    const out = mergeFiles(fromDb, live)
    expect(out[0]?.touch).toBe(FILE_TOUCH_READ)
    expect(out[0]?.at).toBe(20)
  })
})
