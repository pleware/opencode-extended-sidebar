/**
 * pware.oc.omo.resolver.runContinuationFile
 *
 * Run-continuation file → writer-session index. Thin wrapper over the shared
 * omo file engine (`planFile.ts`), pinned to the `.omo/run-continuation/`
 * document kind.
 */
import type { SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import {
  omoFileIndex,
  sessionForOmoFile,
  type OmoFileIndex,
} from "./pware.oc.omo.resolver.planFile.js"

/** Bidirectional run-continuation index for one project (see `omoFileIndex`). */
export function runContinuationSessionIndex(
  db: SqlDb,
  projectId: string | null | undefined,
  projectRoot: string | null | undefined,
): OmoFileIndex {
  return omoFileIndex(db, projectId, projectRoot, "run-continuation")
}

/** The session that last wrote a `.omo/run-continuation/` file, if any. */
export function sessionForRunContinuationFile(
  db: SqlDb,
  relPath: string | null | undefined,
): string | null {
  return sessionForOmoFile(db, relPath, "run-continuation")
}
