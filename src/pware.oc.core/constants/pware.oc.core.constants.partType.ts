/**
 * pware.oc.core.constants.parttype
 *
 * OpenCode `part.data.type` values from the SDK `Part` union
 * (`@opencode-ai/sdk` types.gen.d.ts): TextPart "text", ReasoningPart
 * "reasoning", ToolPart "tool", StepStartPart "step-start", StepFinishPart
 * "step-finish", SnapshotPart "snapshot", PatchPart "patch", AgentPart "agent",
 * subtask "subtask", RetryPart "retry", CompactionPart "compaction",
 * FilePart "file".
 */

/** Part.data.type for a model text response. */
export const PART_TYPE_TEXT = "text"

/** Part.data.type for a model reasoning/thinking step. */
export const PART_TYPE_REASONING = "reasoning"

/** Part.data.type for a tool invocation. */
export const PART_TYPE_TOOL = "tool"

/** Part.data.type for a step-start marker. */
export const PART_TYPE_STEP_START = "step-start"

/** Part.data.type for a step-finish marker. */
export const PART_TYPE_STEP_FINISH = "step-finish"

/** Part.data.type for a snapshot of the session state. */
export const PART_TYPE_SNAPSHOT = "snapshot"

/** Part.data.type for a unified diff patch. */
export const PART_TYPE_PATCH = "patch"

/** Part.data.type for an agent boundary marker. */
export const PART_TYPE_AGENT = "agent"

/** Part.data.type for a subtask boundary marker. */
export const PART_TYPE_SUBTASK = "subtask"

/** Part.data.type for a retry marker. */
export const PART_TYPE_RETRY = "retry"

/** Part.data.type for a compaction marker. */
export const PART_TYPE_COMPACTION = "compaction"

/** Part.data.type for a file artifact. */
export const PART_TYPE_FILE = "file"

/** Every SDK `Part` data type the plugin recognizes. */
export const PART_TYPES = [
  PART_TYPE_TEXT,
  PART_TYPE_REASONING,
  PART_TYPE_TOOL,
  PART_TYPE_STEP_START,
  PART_TYPE_STEP_FINISH,
  PART_TYPE_SNAPSHOT,
  PART_TYPE_PATCH,
  PART_TYPE_AGENT,
  PART_TYPE_SUBTASK,
  PART_TYPE_RETRY,
  PART_TYPE_COMPACTION,
  PART_TYPE_FILE,
] as const

/** A single OpenCode `part.data.type` value. */
export type PartType = (typeof PART_TYPES)[number]
