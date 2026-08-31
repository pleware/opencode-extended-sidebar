/**
 * pware.oc.core.omo.resolver.plan
 *
 * Plan.md parsing: status / slug / pending-action from YAML frontmatter or the
 * `## State` section, plus the approval row label. Pure text — no fs, no scan.
 */
import path from "node:path"
import type { SessionActivityState } from "../../pware.oc.opencode/resolver/pware.oc.opencode.resolver.session.js"

export type ApprovalItem = {
  /** Project-relative path. The panel must never show a root. */
  rel: string
  name: string
  status: string
  /** What happens after approval — e.g. `write .omo/plans/<slug>.md`. */
  pendingAction: string | null
  updatedAt: number | null
  /** Planner session activity; null = no db / no writer session found. */
  sessionState: SessionActivityState | null
  /** ulw-plan review lifecycle from the draft frontmatter; null = no review requested. */
  review: ReviewState | null
}

/** One ulw-plan review lane (momus / independent). */
export type ReviewLane = {
  /** Lane lifecycle: pending | launching | in_flight | approved | changes_requested | inconclusive. */
  status: string | null
  /** Lane verdict, when the lane reported one (pass / fail / approved / blocked / …). */
  result: string | null
}

/**
 * The ulw-plan review state persisted in the draft/plan frontmatter: one live
 * round keyed by `review_round_id` + `plan_sha256` (any plan change bumps the
 * hash and starts a fresh round), with a `momus` and an `independent` lane.
 */
export type ReviewState = {
  required: boolean
  /** `review_round_id` — the live round; a changed `plan_sha256` forces a new one. */
  roundId: string | null
  /** `round_status` — `active` while a round is live. */
  roundStatus: string | null
  /** `plan_sha256` — the reviewed plan's hash, null until a round is initialized. */
  planSha256: string | null
  lanes: { momus: ReviewLane; independent: ReviewLane }
}

/** Row label for an approval item — basename without the `.md` extension. */
export function approvalName(rel: string): string {
  return path.basename(rel).replace(/\.md$/i, "")
}

function frontmatter(text: string): string | null {
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  return m ? (m[1] ?? "") : null
}

function stateSection(text: string): string | null {
  const m = text.match(/##\s+State\s*\r?\n([\s\S]*?)(?=\r?\n##\s|$)/)
  return m ? (m[1] ?? "") : null
}

export function parsePlanStatus(text: string): string | null {
  const fm = frontmatter(text)
  if (fm) {
    const m = fm.match(/^status:\s*["']?([^"'\r\n]+)["']?/m)
    if (m?.[1]) return m[1].trim()
  }
  const state = stateSection(text)
  if (state) {
    const m = state.match(/status:\s*[`'"]?\s*([^\s`'"\r\n]+)/m)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

function parsePlanSlug(text: string): string | null {
  const fm = frontmatter(text)
  if (fm) {
    const m = fm.match(/^slug:\s*["']?([^"'\r\n]+)["']?/m)
    if (m?.[1]) return m[1].trim()
  }
  const state = stateSection(text)
  if (state) {
    const m = state.match(/slug:\s*[`'"]?\s*([^\s`'"\r\n]+)/m)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

export function parsePlanPendingAction(text: string): string | null {
  const fm = frontmatter(text)
  if (fm) {
    const m = fm.match(/^pending-action:\s*["']?([^"'\r\n]+)["']?/m)
    if (m?.[1]) return m[1].trim()
  }
  const slug = parsePlanSlug(text)
  return slug ? `.omo/plans/${slug}.md` : null
}

function scalar(fm: string, key: string): string | null {
  const v = fm.match(new RegExp(`^${key}:\\s*(\\S+)`, "m"))?.[1]
  if (!v || v === "null") return null
  return v.trim()
}

function stripQuotes(v: string): string {
  return v.replace(/^["']|["']$/g, "")
}

/**
 * One review lane (`momus:` / `independent:`) from the frontmatter lines:
 * the lane's own `status` and `result`, stopping at the next top-level key.
 * Line-based so the last frontmatter line needs no trailing newline.
 */
function laneState(fm: string, lane: "momus" | "independent"): ReviewLane | null {
  const lines = fm.split(/\r?\n/)
  const idx = lines.findIndex((l) => l.trim() === `${lane}:`)
  if (idx < 0) return null
  const laneIndent = lines[idx]!.match(/^\s*/)?.[0].length ?? 0
  const out: ReviewLane = { status: null, result: null }
  for (const line of lines.slice(idx + 1)) {
    if ((line.match(/^\s*/)?.[0].length ?? 0) <= laneIndent) break
    const m = line.match(/^\s*(\w[\w-]*):\s*(\S+)?/)
    if (!m) continue
    const val = m[2] && m[2] !== "null" ? stripQuotes(m[2]) : null
    if (m[1] === "status") out.status = val
    else if (m[1] === "result") out.result = val
  }
  return out
}

/**
 * ulw-plan review lifecycle from the frontmatter `review:` block and its
 * siblings (`review_required`, `review_round_id`, `round_status`,
 * `plan_sha256`). Null when the draft carries no review fields at all.
 */
export function parseReviewBlock(text: string): ReviewState | null {
  const fm = frontmatter(text)
  if (!fm) return null
  const required = /^review_required:\s*true/m.test(fm)
  const hasBlock = /^review:\s*$/m.test(fm)
  if (!required && !hasBlock) return null
  return {
    required,
    roundId: scalar(fm, "review_round_id"),
    roundStatus: scalar(fm, "round_status"),
    planSha256: scalar(fm, "plan_sha256"),
    lanes: {
      momus: laneState(fm, "momus") ?? { status: null, result: null },
      independent: laneState(fm, "independent") ?? { status: null, result: null },
    },
  }
}
