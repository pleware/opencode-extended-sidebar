/**
 * pware.oc.core.opencode.resolver.todo
 *
 * Todo rows for one session — content, status, priority, position.
 */
import type { SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"

export type TodoRow = {
  content: string
  status: string
  priority: string
  position: number
}

export function listTodos(db: SqlDb, sessionId: string): TodoRow[] {
  try {
    return db.all<TodoRow>(
      `SELECT content, status, priority, position
       FROM todo WHERE session_id = ?
       ORDER BY position ASC LIMIT 40`,
      sessionId,
    )
  } catch {
    return []
  }
}
