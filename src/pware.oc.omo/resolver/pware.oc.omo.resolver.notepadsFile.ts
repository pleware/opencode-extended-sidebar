/**
 * pware.oc.omo.resolver.notepadsFile
 *
 * Notepad-file → writer-session index. Thin wrapper over the shared omo file
 * engine (`planFile.ts`), pinned to the `.omo/notepads/` document kind.
 */
import type { SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import {
  omoFileIndex,
  sessionForOmoFile,
  type OmoFileIndex,
} from "./pware.oc.omo.resolver.planFile.js"

/** Bidirectional notepad-file index for one project (see `omoFileIndex`). */
export function notepadsSessionIndex(
  db: SqlDb,
  projectId: string | null | undefined,
  projectRoot: string | null | undefined,
): OmoFileIndex {
  return omoFileIndex(db, projectId, projectRoot, "notepad")
}

/** The session that last wrote a `.omo/notepads/` file, if any. */
export function sessionForNotepadFile(db: SqlDb, relPath: string | null | undefined): string | null {
  return sessionForOmoFile(db, relPath, "notepad")
}
