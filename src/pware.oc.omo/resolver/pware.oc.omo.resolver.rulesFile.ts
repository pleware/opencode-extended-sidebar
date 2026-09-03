/**
 * pware.oc.omo.resolver.rulesFile
 *
 * Rule-file → writer-session index. Thin re-export of the shared omo file
 * engine (`planFile.ts`), pinned to the `.omo/rules/` document kind.
 */
import { makeOmoFileResolver } from "./pware.oc.omo.resolver.planFile.js"

/** Bidirectional rule-file index for one project (see `omoFileIndex`). */
export const { sessionIndex: rulesSessionIndex, sessionForFile: sessionForRuleFile } =
  makeOmoFileResolver("rule")
