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
