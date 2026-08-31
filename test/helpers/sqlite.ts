/**
 * Temp opencode.db fixtures for bun:test.
 * Metadata only — no prompts, no tool I/O.
 */
import { Database } from "bun:sqlite"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { resetReadonlyDb } from "../../src/pware.oc.core/pware.oc.core.sqlite.js"

export type SessionSeed = {
  id: string
  project_id?: string
  parent_id?: string | null
  directory?: string
  title?: string
  agent?: string | null
  model?: string | null
  cost?: number
  tokens_input?: number
  tokens_output?: number
  tokens_reasoning?: number
  time_created?: number
  time_updated?: number
  time_archived?: number | null
}

export type MessageSeed = {
  id: string
  session_id: string
  time_created?: number
  data: Record<string, unknown>
}

export type PartSeed = {
  id: string
  session_id: string
  message_id?: string
  time_created?: number
  time_updated?: number
  data: Record<string, unknown>
}

export type FixtureDb = {
  dir: string
  dbPath: string
  dispose: () => void
}

const SCHEMA = `
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  parent_id TEXT,
  directory TEXT,
  title TEXT,
  agent TEXT,
  model TEXT,
  cost REAL,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_reasoning INTEGER,
  time_created INTEGER,
  time_updated INTEGER,
  time_archived INTEGER
);
CREATE TABLE message (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  time_created INTEGER,
  data TEXT
);
CREATE TABLE part (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  message_id TEXT,
  time_created INTEGER,
  time_updated INTEGER,
  data TEXT
);
CREATE INDEX part_session_created ON part (session_id, time_created);
CREATE INDEX message_session_created ON message (session_id, time_created);
`

export function createFixtureDb(opts: {
  sessions?: SessionSeed[]
  messages?: MessageSeed[]
  parts?: PartSeed[]
}): FixtureDb {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oes-db-"))
  const dbPath = path.join(dir, "opencode.db")
  const db = new Database(dbPath)
  db.exec(SCHEMA)
  db.exec("BEGIN")
  const insS = db.prepare(
    `INSERT INTO session (
      id, project_id, parent_id, directory, title, agent, model,
      cost, tokens_input, tokens_output, tokens_reasoning,
      time_created, time_updated, time_archived
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const now = Date.now()
  for (const s of opts.sessions ?? []) {
    insS.run(
      s.id,
      s.project_id ?? "proj_1",
      s.parent_id ?? null,
      s.directory ?? "project",
      s.title ?? "untitled",
      s.agent ?? "build",
      s.model ?? "test-model",
      s.cost ?? 0,
      s.tokens_input ?? 0,
      s.tokens_output ?? 0,
      s.tokens_reasoning ?? 0,
      s.time_created ?? now,
      s.time_updated ?? now,
      s.time_archived ?? null,
    )
  }
  const insM = db.prepare(`INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)`)
  for (const m of opts.messages ?? []) {
    insM.run(m.id, m.session_id, m.time_created ?? now, JSON.stringify(m.data))
  }
  const insP = db.prepare(
    `INSERT INTO part (id, session_id, message_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const p of opts.parts ?? []) {
    const t = p.time_created ?? now
    insP.run(p.id, p.session_id, p.message_id ?? "", t, p.time_updated ?? t, JSON.stringify(p.data))
  }
  db.exec("COMMIT")
  db.close()
  return {
    dir,
    dbPath,
    dispose: () => {
      resetReadonlyDb()
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        // Windows may keep the handle briefly
      }
    },
  }
}

/** Dummy blob so LIKE scanners have something to chew — not real I/O. */
export const DUMMY_PAD = "x".repeat(480)

export function toolPartData(opts: {
  tool: string
  status?: string
  title?: string
  command?: string
  filePath?: string
  pattern?: string
  description?: string
  callID?: string
  start?: number
  end?: number
  additions?: number
  deletions?: number
  pad?: boolean
}): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  if (opts.command) input.command = opts.command
  if (opts.filePath) input.filePath = opts.filePath
  if (opts.pattern) input.pattern = opts.pattern
  if (opts.description) input.description = opts.description
  const metadata: Record<string, unknown> = {}
  if (opts.additions) metadata.additions = opts.additions
  if (opts.deletions) metadata.deletions = opts.deletions
  const state: Record<string, unknown> = {
    status: opts.status ?? "completed",
    time: { start: opts.start ?? 1_000, end: opts.end ?? 2_000 },
  }
  if (opts.title) state.title = opts.title
  if (Object.keys(input).length) state.input = input
  if (Object.keys(metadata).length) state.metadata = metadata
  const data: Record<string, unknown> = {
    type: "tool",
    tool: opts.tool,
    callID: opts.callID ?? "call_x",
    state,
  }
  if (opts.additions) data.additions = opts.additions
  if (opts.deletions) data.deletions = opts.deletions
  if (opts.pad !== false) data.pad = DUMMY_PAD
  return data
}

export function textPartData(opts: { start?: number; end?: number; kind?: "text" | "reasoning" }): Record<string, unknown> {
  return {
    type: opts.kind ?? "text",
    time: { start: opts.start ?? 1_100, end: opts.end ?? 1_800 },
    pad: DUMMY_PAD,
  }
}

export function patchPartData(files: string[]): Record<string, unknown> {
  return { type: "patch", files, pad: DUMMY_PAD }
}

/** One session, `turns` assistant messages, `partCount` parts (tool/text/reasoning/patch mix). */
export function largeSessionSeed(opts?: { turns?: number; partCount?: number; sessionId?: string }): {
  sessions: SessionSeed[]
  messages: MessageSeed[]
  parts: PartSeed[]
} {
  const turns = opts?.turns ?? 120
  const partCount = opts?.partCount ?? 5_000
  const sessionId = opts?.sessionId ?? "ses_bench"
  const t0 = 1_700_000_000_000
  const sessions: SessionSeed[] = [
    {
      id: sessionId,
      project_id: "proj_bench",
      title: "bench",
      time_created: t0,
      time_updated: t0 + turns * 10_000,
    },
  ]
  const messages: MessageSeed[] = []
  const parts: PartSeed[] = []
  const kinds = ["tool", "text", "reasoning", "patch", "edit"] as const
  for (let i = 0; i < turns; i++) {
    const created = t0 + i * 10_000
    messages.push({
      id: `msg_${i}`,
      session_id: sessionId,
      time_created: created,
      data: assistantMsg({
        created,
        completed: created + 8_000,
        tin: 100,
        tout: 50,
      }),
    })
  }
  for (let i = 0; i < partCount; i++) {
    const mid = `msg_${i % turns}`
    const created = t0 + i * 2
    const kind = kinds[i % kinds.length]
    let data: Record<string, unknown>
    if (kind === "text" || kind === "reasoning") {
      data = textPartData({ kind, start: created + 50, end: created + 400 })
    } else if (kind === "patch") {
      data = patchPartData([`src/f${i % 40}.ts`])
    } else if (kind === "edit") {
      data = toolPartData({
        tool: "edit",
        filePath: `src/f${i % 40}.ts`,
        additions: 2,
        deletions: 1,
        start: created,
        end: created + 30,
        callID: `call_${i}`,
      })
    } else {
      data = toolPartData({
        tool: "bash",
        command: "ls src",
        title: "ls src",
        start: created,
        end: created + 20,
        callID: `call_${i}`,
      })
    }
    parts.push({
      id: `prt_${i}`,
      session_id: sessionId,
      message_id: mid,
      time_created: created,
      time_updated: created + 40,
      data,
    })
  }
  return { sessions, messages, parts }
}

export function assistantMsg(opts: {
  model?: string
  provider?: string
  created?: number
  completed?: number
  tin?: number
  tout?: number
  treason?: number
  cread?: number
  cwrite?: number
  cost?: number
  err?: string
}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    role: "assistant",
    modelID: opts.model ?? "test-model",
    providerID: opts.provider ?? "test",
    time: { created: opts.created ?? 1_000, completed: opts.completed ?? 3_000 },
    tokens: {
      input: opts.tin ?? 10,
      output: opts.tout ?? 20,
      reasoning: opts.treason ?? 0,
      cache: { read: opts.cread ?? 0, write: opts.cwrite ?? 0 },
    },
    cost: opts.cost ?? 0,
  }
  if (opts.err) data.error = { name: opts.err }
  return data
}
