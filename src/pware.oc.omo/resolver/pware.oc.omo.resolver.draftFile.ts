/**
 * pware.oc.omo.resolver.draftFile
 *
 * Draft-file → writer-session index. Thin wrapper over the shared omo file
 * engine (`planFile.ts`), pinned to the `.omo/drafts/` document kind.
 */
import type { SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import { DOC_KIND_DRAFT } from "../constants/pware.oc.omo.constants.docKind.js"
import {
  listOmoFiles,
  type DocView,
  type ListOmoFilesOptions,
} from "./pware.oc.omo.resolver.doc.js"
import {
  omoFileIndex,
  sessionForOmoFile,
  type OmoFileIndex,
} from "./pware.oc.omo.resolver.planFile.js"

/** Bidirectional draft-file index for one project (see `omoFileIndex`). */
export function draftSessionIndex(
  db: SqlDb,
  projectId: string | null | undefined,
  projectRoot: string | null | undefined,
): OmoFileIndex {
  return omoFileIndex(db, projectId, projectRoot, "draft")
}

/** The session that last wrote a `.omo/drafts/` file, if any. */
export function sessionForDraftFile(db: SqlDb, relPath: string | null | undefined): string | null {
  return sessionForOmoFile(db, relPath, "draft")
}

/** Draft files under `.omo/drafts/`, optionally filtered by writer session. */
export const DraftFile = {
  list(
    projectRoot: string | null | undefined,
    sessionId: string | null = null,
    opts: ListOmoFilesOptions = {},
  ): DocView[] {
    return listOmoFiles(DOC_KIND_DRAFT, projectRoot, { ...opts, sessionId })
  },
}
