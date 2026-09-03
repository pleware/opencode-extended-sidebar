/**
 * pware.oc.omo.resolver.draftFile
 *
 * Draft-file → writer-session index. Thin re-export of the shared omo file
 * engine (`planFile.ts`), pinned to the `.omo/drafts/` document kind.
 */
import { DOC_KIND_DRAFT } from "../constants/pware.oc.omo.constants.docKind.js"
import {
  makeOmoFileList,
  makeOmoFileResolver,
} from "./pware.oc.omo.resolver.planFile.js"

/** Bidirectional draft-file index for one project (see `omoFileIndex`). */
export const { sessionIndex: draftSessionIndex, sessionForFile: sessionForDraftFile } =
  makeOmoFileResolver("draft")

/** Draft files under `.omo/drafts/`, optionally filtered by writer session. */
export const DraftFile = makeOmoFileList(DOC_KIND_DRAFT)
