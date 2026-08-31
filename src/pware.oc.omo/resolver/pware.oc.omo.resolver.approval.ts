/**
 * pware.oc.core.omo.resolver.approval
 *
 * OMO plan approval queue — drafts/plans under `.omo/` (or legacy `.sisyphus/`)
 * whose `status` says they are waiting for the user's sign-off. Scanned lazily
 * behind a short TTL, never on the poll path; a missing `.omo/` is an empty
 * list, not an error.
 */
import fs from "node:fs"
import path from "node:path"
import { createStampCache } from "../../pware.oc.core/pware.oc.core.cache.js"
import { canonicalizePath } from "../../pware.oc.core/pware.oc.core.paths.js"
import { PLAN_PENDING_STATUSES } from "../constants/pware.oc.omo.constants.planStatus.js"
import { findOmoWatchDirs } from "./pware.oc.omo.resolver.boulder.js"
import {
  approvalName,
  parsePlanPendingAction,
  parsePlanStatus,
  type ApprovalItem,
} from "./pware.oc.omo.resolver.plan.js"

const PENDING_STATUS = new Set<string>(PLAN_PENDING_STATUSES)
const MAX_ITEMS = 40
const TTL_MS = 2_000

function statOf(abs: string): number | null {
  try {
    const st = fs.statSync(abs)
    return st.isFile() ? Math.round(st.mtimeMs) : null
  } catch {
    return null
  }
}

/** Markdown files directly under a drafts/ or plans/ directory, depth 1. */
function listMdFiles(base: string): string[] {
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(base, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of entries) {
    if (e.name.startsWith(".")) continue
    if (!e.isFile()) continue
    if (!e.name.toLowerCase().endsWith(".md")) continue
    out.push(path.join(base, e.name))
  }
  return out
}

function scan(root: string): ApprovalItem[] {
  const out: ApprovalItem[] = []
  const seen = new Set<string>()
  for (const omoDir of findOmoWatchDirs(root)) {
    for (const sub of ["drafts", "plans"]) {
      for (const abs of listMdFiles(path.join(omoDir, sub))) {
        const rel = path.relative(root, abs).replace(/\\/g, "/")
        if (!rel || rel.startsWith("..") || seen.has(rel)) continue
        let text = ""
        try {
          text = fs.readFileSync(abs, "utf8")
        } catch {
          continue
        }
        const status = parsePlanStatus(text)
        if (!status || !PENDING_STATUS.has(status.toLowerCase())) continue
        seen.add(rel)
        out.push({
          rel,
          name: approvalName(rel),
          status,
          pendingAction: parsePlanPendingAction(text),
          updatedAt: statOf(abs),
          sessionState: null,
        })
      }
    }
  }
  out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.name.localeCompare(b.name))
  return out.slice(0, MAX_ITEMS)
}

const approvalsCache = createStampCache<ApprovalItem[]>({ ttlMs: TTL_MS })

/** Drop the approval cache so the next read hits the filesystem. */
export function resetApprovalsCache(): void {
  approvalsCache.reset()
}

export function listPendingApprovals(projectRoot: string | null | undefined): ApprovalItem[] {
  if (!projectRoot) return []
  const root = canonicalizePath(projectRoot)
  return approvalsCache.get(root, () => scan(root))
}
