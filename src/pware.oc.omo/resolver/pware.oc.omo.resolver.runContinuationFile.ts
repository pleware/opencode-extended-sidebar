/**
 * pware.oc.omo.resolver.runContinuationFile
 *
 * Run-continuation file → writer-session index. Thin re-export of the shared
 * omo file engine (`planFile.ts`), pinned to the `.omo/run-continuation/`
 * document kind.
 */
import { makeOmoFileResolver } from "./pware.oc.omo.resolver.planFile.js"

/** Bidirectional run-continuation index for one project (see `omoFileIndex`). */
export const {
  sessionIndex: runContinuationSessionIndex,
  sessionForFile: sessionForRunContinuationFile,
} = makeOmoFileResolver("run-continuation")
