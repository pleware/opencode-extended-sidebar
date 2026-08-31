/**
 * pware.oc.core.constants.toolname
 *
 * OpenCode tool names grouped by file-touch behavior (the plugin's
 * WRITE_TOOLS / READ_TOOLS in files.ts) plus the special non-file tools the
 * code classifies (`bash`, `task`, `question`).
 */

/** Tool name that edits an existing file. */
export const TOOL_EDIT = "edit"

/** Tool name that writes a file. */
export const TOOL_WRITE = "write"

/** Tool name for a multi-file edit. */
export const TOOL_MULTIEDIT = "multiedit"

/** Tool name for applying a prebuilt edit (underscore spelling). */
export const TOOL_APPLY_EDIT = "apply_edit"

/** Tool name for applying a prebuilt edit (compact spelling). */
export const TOOL_APPLYEDIT = "applyedit"

/** Tool name that deletes a file. */
export const TOOL_DELETE = "delete"

/** Tool name that removes a file. */
export const TOOL_REMOVE = "remove"

/** Tool name that reads a file. */
export const TOOL_READ = "read"

/** Tool name that views a file. */
export const TOOL_VIEW = "view"

/** Tool name that reads a file (underscore spelling). */
export const TOOL_READ_FILE = "read_file"

/** Tool name that reads a file (compact spelling). */
export const TOOL_READFILE = "readfile"

/** Tool name for a shell command — a non-file tool the panel classifies. */
export const TOOL_BASH = "bash"

/** Tool name for delegating a subtask — a non-file tool the panel classifies. */
export const TOOL_TASK = "task"

/** Tool name for asking the user a question — a non-file tool the panel classifies. */
export const TOOL_QUESTION = "question"

/** Tools that write/delete files — mirrors files.ts WRITE_TOOLS. */
export const WRITE_TOOLS = [
  TOOL_EDIT,
  TOOL_WRITE,
  TOOL_MULTIEDIT,
  TOOL_APPLY_EDIT,
  TOOL_APPLYEDIT,
  TOOL_DELETE,
  TOOL_REMOVE,
] as const

/** Tools that read/view files — mirrors files.ts READ_TOOLS. */
export const READ_TOOLS = [TOOL_READ, TOOL_VIEW, TOOL_READ_FILE, TOOL_READFILE] as const

/** Non-file tools the panel classifies separately from file-touch behavior. */
export const NON_FILE_TOOLS = [TOOL_BASH, TOOL_TASK, TOOL_QUESTION] as const

/** A tool name the panel classifies by file-touch or special behavior. */
export type ToolName = (typeof WRITE_TOOLS)[number] | (typeof READ_TOOLS)[number] | (typeof NON_FILE_TOOLS)[number]
