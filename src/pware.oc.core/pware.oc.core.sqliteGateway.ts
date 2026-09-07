/**
 * One process-local policy for readonly SQLite requests. Requests are queued,
 * retried as a whole, and publish only their final state. Stages yield to the
 * event loop so the synchronous SQLite driver never forms one long main-thread
 * burst when the worker fallback is active.
 */
import {
  openReadonlyDb,
  resetReadonlyDb,
  type SqlDb,
} from "./pware.oc.core.sqlite.js"

export type ReadStage<T> = (db: SqlDb, state: T) => T

export type ReadRequest<T> = {
  readonly dbPath: string
  readonly initial: () => T
  readonly stages: readonly ReadStage<T>[]
  readonly fallback: (error: unknown) => T
}

export type ReadGateway = {
  run: <T>(request: ReadRequest<T>) => Promise<T>
}

type ReadGatewayDeps = {
  readonly open: (dbPath: string) => SqlDb | null
  readonly reset: () => void
  readonly yieldControl: () => Promise<void>
}

export class ReadonlyDbUnavailableError extends Error {
  readonly dbPath: string

  constructor(dbPath: string) {
    super(`readonly SQLite unavailable: ${dbPath}`)
    this.name = "ReadonlyDbUnavailableError"
    this.dbPath = dbPath
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export function createReadGateway(
  deps: ReadGatewayDeps = {
    open: openReadonlyDb,
    reset: resetReadonlyDb,
    yieldControl: yieldToEventLoop,
  },
): ReadGateway {
  let tail = Promise.resolve()

  const execute = async <T>(request: ReadRequest<T>): Promise<T> => {
    let firstError: unknown = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const db = deps.open(request.dbPath)
        if (!db) throw new ReadonlyDbUnavailableError(request.dbPath)
        let state = request.initial()
        for (let index = 0; index < request.stages.length; index += 1) {
          const stage = request.stages[index]
          if (!stage) continue
          if (index > 0) await deps.yieldControl()
          state = stage(db, state)
        }
        return state
      } catch (error) {
        firstError ??= error
        deps.reset()
      }
    }
    return request.fallback(firstError)
  }

  return {
    run<T>(request: ReadRequest<T>): Promise<T> {
      const result = tail.then(() => execute(request))
      tail = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  }
}

export const readonlyReadGateway = createReadGateway()
