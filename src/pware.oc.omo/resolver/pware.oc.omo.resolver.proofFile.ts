/**
 * pware.oc.omo.resolver.proofFile
 *
 * Evidence (proof) file → writer-session index. Thin wrapper over the shared
 * omo file engine (`planFile.ts`), pinned to the `.omo/evidence/` document kind.
 */
import type { SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import {
  omoFileIndex,
  sessionForOmoFile,
  type OmoFileIndex,
} from "./pware.oc.omo.resolver.planFile.js"

/** Bidirectional evidence-file index for one project (see `omoFileIndex`). */
export function proofSessionIndex(
  db: SqlDb,
  projectId: string | null | undefined,
  projectRoot: string | null | undefined,
): OmoFileIndex {
  return omoFileIndex(db, projectId, projectRoot, "proof")
}

/** The session that last wrote a `.omo/evidence/` file, if any. */
export function sessionForProofFile(db: SqlDb, relPath: string | null | undefined): string | null {
  return sessionForOmoFile(db, relPath, "proof")
}
