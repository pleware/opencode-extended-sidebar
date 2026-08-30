import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { canPreviewPath, isMarkdownPath, readTextPreview } from "../../src/detail.js"
import { normalizeIncomingPath, relativeProjectPath, resolveProjectFile } from "../../src/paths.js"

describe("relativeProjectPath", () => {
  test("returns project-relative posix path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "oes-rel-root-"))
    fs.mkdirSync(path.join(root, "src"), { recursive: true })
    const file = path.join(root, "src", "app.ts")
    fs.writeFileSync(file, "")
    const rel = relativeProjectPath(root, file)
    expect(rel).toBe("src/app.ts")
    fs.rmSync(root, { recursive: true, force: true })
  })

  test("rejects paths outside project root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "oes-rel-root-"))
    const outside = path.join(os.tmpdir(), "elsewhere", "x.ts")
    expect(relativeProjectPath(root, outside)).toBeNull()
    fs.rmSync(root, { recursive: true, force: true })
  })

  test("resolveProjectFile accepts mixed slashes when the file exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "oes-slash-"))
    const nested = path.join(root, "docs")
    fs.mkdirSync(nested)
    const file = path.join(nested, "note.md")
    fs.writeFileSync(file, "# hi\n")
    const posix = path.relative(root, file).replace(/\\/g, "/")
    const hit = resolveProjectFile(root, posix)
    expect(hit?.rel).toBe("docs/note.md")
    expect(hit?.abs).toBeTruthy()
    fs.rmSync(root, { recursive: true, force: true })
  })
})

describe("normalizeIncomingPath", () => {
  test("folds git-bash drive paths", () => {
    expect(normalizeIncomingPath("/d/proj/README.md").replace(/\\/g, "/")).toBe("d:/proj/README.md")
  })
})

describe("preview helpers", () => {
  test("canPreviewPath accepts markdown", () => {
    expect(canPreviewPath("README.md")).toBe(true)
    expect(canPreviewPath("blob.bin")).toBe(false)
  })

  test("isMarkdownPath is only .md", () => {
    expect(isMarkdownPath("plan.md")).toBe(true)
    expect(isMarkdownPath("src/app.ts")).toBe(false)
  })

  test("readTextPreview reads text and truncates long files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oes-preview-"))
    const file = path.join(dir, "note.md")
    fs.writeFileSync(file, "line1\nline2\n")
    const out = readTextPreview(file)
    expect(out?.text).toBe("line1\nline2")
    expect(out?.truncated).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
