/**
 * pware.oc.omo.resolver.proofFile
 *
 * Evidence (proof) file → writer-session index. Thin re-export of the shared
 * omo file engine (`planFile.ts`), pinned to the `.omo/evidence/` document kind.
 */
import { DOC_KIND_PROOF } from "../constants/pware.oc.omo.constants.docKind.js"
import {
  makeOmoFileList,
  makeOmoFileResolver,
} from "./pware.oc.omo.resolver.planFile.js"

/** Bidirectional evidence-file index for one project (see `omoFileIndex`). */
export const { sessionIndex: proofSessionIndex, sessionForFile: sessionForProofFile } =
  makeOmoFileResolver("proof")

/** Evidence files under `.omo/evidence/`, optionally filtered by writer session. */
export const ProofFile = makeOmoFileList(DOC_KIND_PROOF)
