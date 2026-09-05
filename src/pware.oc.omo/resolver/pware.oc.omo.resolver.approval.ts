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
import { profile } from "../../pware.oc.core/pware.oc.core.debug.js"
import { canonicalizePath } from "../../pware.oc.core/pware.oc.core.paths.js"
import {
  MY_WORK_GROUP_DRAFTING,
  MY_WORK_GROUP_FINISHED,
  MY_WORK_GROUP_READY_REVIEW,
  MY_WORK_GROUP_READY_START,
} from "../../pware.oc.core/constants/pware.oc.core.constants.myWork.js"
import { resolveApprovalGroup } from "./pware.oc.omo.resolver.approvalGroup.js"
import { findOmoWatchDirs, planWorkStateByPlanName } from "./pware.oc.omo.resolver.boulder.js"
import {
  approvalName,
  parsePlanPendingAction,
  parsePlanStatus,
  parseReviewBlock,
  type ApprovalItem,
} from "./pware.oc.omo.resolver.plan.js"

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

/** The "My work" approval buckets, keyed by group, in scan order. */
export type ScanResult = {
  drafting: ApprovalItem[]
  readyReview: ApprovalItem[]
  readyStart: ApprovalItem[]
  finished: ApprovalItem[]
  /** Draft documents no action group covers — approved/done, unknown or no status. */
  draftDocs: ApprovalItem[]
  /** Plan documents no action group covers — unknown or no status. */
  plans: ApprovalItem[]
}

function emptyScan(): ScanResult {
  return {
    drafting: [],
    readyReview: [],
    readyStart: [],
    finished: [],
    draftDocs: [],
    plans: [],
  }
}

function sortApprovals(items: ApprovalItem[]): ApprovalItem[] {
  items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.name.localeCompare(b.name))
  return items.slice(0, MAX_ITEMS)
}

function scan(root: string): ScanResult {
  const drafting: ApprovalItem[] = []
  const readyReview: ApprovalItem[] = []
  const readyStart: ApprovalItem[] = []
  const finished: ApprovalItem[] = []
  const draftDocs: ApprovalItem[] = []
  const plans: ApprovalItem[] = []
  const seen = new Set<string>()
  const workStates = planWorkStateByPlanName(root)
  for (const omoDir of findOmoWatchDirs(root)) {
    for (const sub of ["drafts", "plans"]) {
      const isDraft = sub === "drafts"
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
        const name = approvalName(rel)
        const workState = workStates.get(name) ?? "absent"
        // A plan with no parseable status is still a plan document — it lands in
        // the Plans archive below (decided after this status guard). A draft
        // without a status is still a working document — Draft docs.
        const group = status ? resolveApprovalGroup(status, isDraft, workState, false) : null
        const item: ApprovalItem = {
          rel,
          name,
          status,
          pendingAction: parsePlanPendingAction(text),
          updatedAt: statOf(abs),
          review: parseReviewBlock(text),
          workState,
        }
        if (!group) {
          // A document no action group covers (superseded approved/done, unknown
          // or no status) is browsable, not a queue item: drafts → Draft docs,
          // plans → Plans.
          seen.add(rel)
          if (isDraft) draftDocs.push(item)
          else plans.push(item)
          continue
        }
        seen.add(rel)
        switch (group) {
          case MY_WORK_GROUP_DRAFTING:
            drafting.push(item)
            break
          case MY_WORK_GROUP_READY_REVIEW:
            readyReview.push(item)
            break
          case MY_WORK_GROUP_READY_START:
            readyStart.push(item)
            break
          case MY_WORK_GROUP_FINISHED:
            finished.push(item)
            break
        }
      }
    }
  }
  return {
    drafting: sortApprovals(drafting),
    readyReview: sortApprovals(readyReview),
    readyStart: sortApprovals(readyStart),
    finished: sortApprovals(finished),
    draftDocs: sortApprovals(draftDocs),
    plans: sortApprovals(plans),
  }
}

const approvalsCache = createStampCache<ScanResult>({ ttlMs: TTL_MS })

/** Drop the approval cache so the next read hits the filesystem. */
export function resetApprovalsCache(): void {
  approvalsCache.reset()
}

/** Drafts/plans split into the four "My work" buckets by status + file type. */
export function listApprovals(projectRoot: string | null | undefined): ScanResult {
  if (!projectRoot) return emptyScan()
  const root = canonicalizePath(projectRoot)
  return profile("omo.approvals", () => approvalsCache.get(root, () => scan(root)))
}
