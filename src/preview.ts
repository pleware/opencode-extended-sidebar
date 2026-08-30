/**
 * File preview helpers (no OpenTUI). Unit tests import this, not detail.tsx.
 */
import fs from "node:fs"
import path from "node:path"

const PREVIEW_MAX_LINES = 200
const PREVIEW_MAX_BYTES = 128_000
/** DialogPad 2 + header 1 + footer 3 + slack 1. Extra is the optional relative-path line. */
const PREVIEW_CHROME = 7
const PREVIEW_MIN_ROWS = 8

const PREVIEW_EXT = new Set([
  ".md",
  ".txt",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".html",
  ".css",
  ".scss",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".sh",
  ".py",
  ".rs",
  ".go",
  ".sql",
  ".csv",
])

export function previewViewportRows(termHeight: number, extraChrome = 0, tall = false): number {
  const h = Number.isFinite(termHeight) && termHeight > 0 ? termHeight : 24
  const ratio = tall ? 0.9 : 0.75
  const min = tall ? 12 : PREVIEW_MIN_ROWS
  return Math.max(min, Math.floor(h * ratio) - PREVIEW_CHROME - extraChrome)
}

export function canPreviewPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return PREVIEW_EXT.has(ext)
}

export function isMarkdownPath(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".md"
}

export function readTextPreview(absPath: string): { text: string; truncated: boolean } | null {
  try {
    const st = fs.statSync(absPath)
    if (!st.isFile()) return null
    const buf = fs.readFileSync(absPath)
    const slice = buf.subarray(0, Math.min(buf.length, PREVIEW_MAX_BYTES))
    if (slice.includes(0)) return null
    let text = slice.toString("utf8")
    const lines = text.split(/\r?\n/)
    let truncated = buf.length > PREVIEW_MAX_BYTES
    if (lines.length > PREVIEW_MAX_LINES) {
      text = lines.slice(0, PREVIEW_MAX_LINES).join("\n")
      truncated = true
    }
    return { text, truncated }
  } catch {
    return null
  }
}
