import type { DocView } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.doc.js"
import {
  DraftFile,
  sessionForPlanFile,
} from "../pware.oc.omo/resolver/index.js"
import { readonlyReadGateway } from "../pware.oc.core/pware.oc.core.sqliteGateway.js"

export type PlanSessionRead = {
  readonly dbAvailable: boolean
  readonly sessionId: string | null
}

export function readSessionDrafts(opts: {
  readonly dbPath: string
  readonly projectRoot: string | null
  readonly sessionId: string
}): Promise<DocView[]> {
  if (!opts.projectRoot || !opts.sessionId) return Promise.resolve([])
  return readonlyReadGateway.run<DocView[]>({
    dbPath: opts.dbPath,
    initial: () => [] as DocView[],
    stages: [(db) => DraftFile.list(opts.projectRoot, opts.sessionId, { db })],
    fallback: () => [],
  })
}

export function readPlanSession(opts: {
  readonly dbPath: string
  readonly rel: string
}): Promise<PlanSessionRead> {
  return readonlyReadGateway.run<PlanSessionRead>({
    dbPath: opts.dbPath,
    initial: () => ({ dbAvailable: true, sessionId: null }),
    stages: [(db) => ({ dbAvailable: true, sessionId: sessionForPlanFile(db, opts.rel) })],
    fallback: () => ({ dbAvailable: false, sessionId: null }),
  })
}
