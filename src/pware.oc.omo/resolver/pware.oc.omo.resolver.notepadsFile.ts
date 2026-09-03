/**
 * pware.oc.omo.resolver.notepadsFile
 *
 * Notepad-file → writer-session index. Thin re-export of the shared omo file
 * engine (`planFile.ts`), pinned to the `.omo/notepads/` document kind.
 */
import { DOC_KIND_NOTEPAD } from "../constants/pware.oc.omo.constants.docKind.js"
import {
  makeOmoFileList,
  makeOmoFileResolver,
} from "./pware.oc.omo.resolver.planFile.js"

/** Bidirectional notepad-file index for one project (see `omoFileIndex`). */
export const { sessionIndex: notepadsSessionIndex, sessionForFile: sessionForNotepadFile } =
  makeOmoFileResolver("notepad")

/** Notepad files under `.omo/notepads/`, optionally filtered by writer session. */
export const NotepadFile = makeOmoFileList(DOC_KIND_NOTEPAD)
