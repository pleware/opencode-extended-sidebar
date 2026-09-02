/**
 * Fail when a view object leaks prompts, tool I/O, or displayable full paths.
 * Internal keys (id, directory, dbPath, …) are skipped — they are never shown.
 */

const INTERNAL = new Set([
  "id",
  "directory",
  "dbPath",
  "boulderPath",
  "planPath",
  "path",
  "fingerprint",
  "scanStamp",
  "sessionId",
  "parentId",
  "partId",
  "taskKey",
  "callId",
])

const BAD_KEY = /^(prompt|output|args|input|content|body|patch|diff|stdout|stderr)$/i
const ABSOLUTE = /^([A-Za-z]:[\\/]|\/)/

export function assertPrivacy(value: unknown, trail = "root"): void {
  walk(value, trail, false)
}

function walk(value: unknown, trail: string, underInternal: boolean): void {
  if (value == null) return
  if (typeof value === "string") {
    if (underInternal) return
    if (ABSOLUTE.test(value) && value.length > 3) {
      throw new Error(`absolute path leaked at ${trail}: ${value.slice(0, 80)}`)
    }
    return
  }
  if (typeof value !== "object") return
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${trail}[${i}]`, underInternal))
    return
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const next = `${trail}.${k}`
    if (BAD_KEY.test(k)) {
      throw new Error(`forbidden key ${next}`)
    }
    walk(v, next, underInternal || INTERNAL.has(k))
  }
}
