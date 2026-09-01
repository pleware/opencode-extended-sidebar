/**
 * pware.oc.core.constants.eventkind
 *
 * The plugin's own classification of host events — the four buckets the panel
 * reacts to. `pware.oc.core.events.ts` maps raw event types onto these.
 */

/** Event kind: model flow (delta / step / status). */
export const EVENT_KIND_FLOW = "flow"

/** Event kind: a tool call. */
export const EVENT_KIND_TOOL = "tool"

/** Event kind: a file was edited. */
export const EVENT_KIND_FILE = "file"

/** Event kind: the database should be re-read. */
export const EVENT_KIND_DB_REFRESH = "db-refresh"

/** Every host event kind the plugin recognizes. */
export const EVENT_KINDS = [
  EVENT_KIND_FLOW,
  EVENT_KIND_TOOL,
  EVENT_KIND_FILE,
  EVENT_KIND_DB_REFRESH,
] as const

/** A host event kind. */
export type EventKind = (typeof EVENT_KINDS)[number]
