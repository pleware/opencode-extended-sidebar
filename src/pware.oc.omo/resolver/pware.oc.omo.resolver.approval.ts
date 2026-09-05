/**
 * pware.oc.core.omo.resolver.approval
 *
 * OMO plan approval queue — drafts/plans under `.omo/` (or legacy `.sisyphus/`)
 * whose `status` says they are waiting for the user's sign-off. File discovery
 * and stat are shared with the docs index: both this module and `doc.ts` read
 * one per-root omo scan cache, so `.omo/` is walked once per TTL no matter how
 * many consumers ask. Classification then reads each plan/draft file's
 * frontmatter; the result is memoized against the same scan record and is
 * recomputed only when that record turns over. A missing `.omo/` is an empty
 * list, not an error.
 */
import fs from "node:fs"
import path from "node:path"
import { profile } from "../../pware.oc.core/pware.oc.core.debug.js"
import { canonicalizePath } from "../../pware.oc.core/pware.oc.core.paths.js"
import {
  MY_WORK_GROUP_DRAFTING,
  MY_WORK_GROUP_FINISHED,
  MY_WORK_GROUP_READY_REVIEW,
  MY_WORK_GROUP_READY_START,
} from "../../pware.oc.core/constants/pware.oc.core.constants.myWork.js"
import { resolveApprovalGroup } from "./pware.oc.omo.resolver.approvalGroup.js"
import { planWorkStateByPlanName } from "./pware.oc.omo.resolver.boulder.js"
import {
  approvalName,
  parsePlanPendingAction,
  parsePlanStatus,
  parseReviewBlock,
  type ApprovalItem,
} from "./pware.oc.omo.resolver.plan.js"
import { DOC_KIND_DRAFT, DOC_KIND_PLAN } from "../constants/pware.oc.omo.constants.docKind.js"
import {
  omoKindRows,
  omoScanRecord,
  resetDocsCache,
  type OmoDocScan,
} from "./pware.oc.omo.resolver.doc.js"
import type { DocView } from "./pware.oc.omo.resolver.doc.js"

const MAX_ITEMS = 40

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

function isMarkdown(rel: string): boolean {
  return rel.toLowerCase().endsWith(".md")
}

/** Drafts/plans split into the four "My work" buckets by status + file type. */
function classify(
  root: string,
  draftRows: readonly DocView[],
  planRows: readonly DocView[],
): ScanResult {
  const drafting: ApprovalItem[] = []
  const readyReview: ApprovalItem[] = []
  const readyStart: ApprovalItem[] = []
  const finished: ApprovalItem[] = []
  const draftDocs: ApprovalItem[] = []
  const plans: ApprovalItem[] = []
  const seen = new Set<string>()
  const workStates = planWorkStateByPlanName(root)
  const visit = (rows: readonly DocView[], isDraft: boolean) => {
    for (const row of rows) {
      const rel = row.rel
      if (!isMarkdown(rel) || seen.has(rel)) continue
      let text = ""
      try {
        text = fs.readFileSync(path.join(root, rel), "utf8")
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
        updatedAt: row.updatedAt,
        review: parseReviewBlock(text),
        workState,
      }
      seen.add(rel)
      if (!group) {
        // A document no action group covers (superseded approved/done, unknown
        // or no status) is browsable, not a queue item: drafts → Draft docs,
        // plans → Plans.
        if (isDraft) draftDocs.push(item)
        else plans.push(item)
        continue
      }
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
  visit(draftRows, true)
  visit(planRows, false)
  return {
    drafting: sortApprovals(drafting),
    readyReview: sortApprovals(readyReview),
    readyStart: sortApprovals(readyStart),
    finished: sortApprovals(finished),
    draftDocs: sortApprovals(draftDocs),
    plans: sortApprovals(plans),
  }
}

/** Approval buckets memoized against the shared per-root omo scan record. */
const approvalMemo = new WeakMap<OmoDocScan, ScanResult>()

/** Drop the shared omo scan cache — approvals and docs both re-read next call. */
export function resetApprovalsCache(): void {
  resetDocsCache()
}

/** Drafts/plans split into the four "My work" buckets by status + file type. */
export function listApprovals(projectRoot: string | null | undefined): ScanResult {
  if (!projectRoot) return emptyScan()
  const root = canonicalizePath(projectRoot)
  const scan = omoScanRecord(root)
  if (!scan) return emptyScan()
  const memoized = approvalMemo.get(scan)
  if (memoized) return memoized
  const result = profile("omo.approvals", () =>
    classify(
      root,
      omoKindRows(DOC_KIND_DRAFT, root),
      omoKindRows(DOC_KIND_PLAN, root),
    ),
  )
  approvalMemo.set(scan, result)
  return result
}
