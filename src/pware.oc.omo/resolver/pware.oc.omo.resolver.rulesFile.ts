/**
 * pware.oc.omo.resolver.rulesFile
 *
 * Rule-file → writer-session index. Thin wrapper over the shared omo file
 * engine (`planFile.ts`), pinned to the `.omo/rules/` document kind.
 */
import type { SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import {
  omoFileIndex,
  sessionForOmoFile,
  type OmoFileIndex,
} from "./pware.oc.omo.resolver.planFile.js"

/** Bidirectional rule-file index for one project (see `omoFileIndex`). */
export function rulesSessionIndex(
  db: SqlDb,
  projectId: string | null | undefined,
  projectRoot: string | null | undefined,
): OmoFileIndex {
  return omoFileIndex(db, projectId, projectRoot, "rule")
}

/** The session that last wrote a `.omo/rules/` file, if any. */
export function sessionForRuleFile(db: SqlDb, relPath: string | null | undefined): string | null {
  return sessionForOmoFile(db, relPath, "rule")
}
