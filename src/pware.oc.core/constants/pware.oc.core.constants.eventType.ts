/**
 * pware.oc.core.constants.eventtype
 *
 * OpenCode host event `type` strings (SDK `Event` union, `@opencode-ai/sdk`
 * dist/gen/types.gen.d.ts). The plugin only classifies a subset via
 * `includes()`/`endsWith()`, so this exports BOTH the full SDK literal set AND
 * the specific stream substrings the code matches on.
 */

/** Event: a message's metadata changed. */
export const EVENT_MESSAGE_UPDATED = "message.updated"

/** Event: a message was removed. */
export const EVENT_MESSAGE_REMOVED = "message.removed"

/** Event: a part within a message was updated. */
export const EVENT_MESSAGE_PART_UPDATED = "message.part.updated"

/** Event: a part within a message was removed. */
export const EVENT_MESSAGE_PART_REMOVED = "message.part.removed"

/** Event: the session status changed. */
export const EVENT_SESSION_STATUS = "session.status"

/** Event: the session became idle. */
export const EVENT_SESSION_IDLE = "session.idle"

/** Event: a new session was created. */
export const EVENT_SESSION_CREATED = "session.created"

/** Event: session metadata changed. */
export const EVENT_SESSION_UPDATED = "session.updated"

/** Event: a session was deleted. */
export const EVENT_SESSION_DELETED = "session.deleted"

/** Event: the session diff changed. */
export const EVENT_SESSION_DIFF = "session.diff"

/** Event: the session was compacted. */
export const EVENT_SESSION_COMPACTED = "session.compacted"

/** Event: the session errored. */
export const EVENT_SESSION_ERROR = "session.error"

/** Event: a file was edited. */
export const EVENT_FILE_EDITED = "file.edited"

/** Event: the file watcher reported a change. */
export const EVENT_FILE_WATCHER_UPDATED = "file.watcher.updated"

/** Event: a todo changed. */
export const EVENT_TODO_UPDATED = "todo.updated"

/** Event: a permission was requested or changed. */
export const EVENT_PERMISSION_UPDATED = "permission.updated"

/** Event: the user replied to a permission request. */
export const EVENT_PERMISSION_REPLIED = "permission.replied"

/** Event: a command was executed. */
export const EVENT_COMMAND_EXECUTED = "command.executed"

/** Event: a PTY was created. */
export const EVENT_PTY_CREATED = "pty.created"

/** Event: a PTY was updated. */
export const EVENT_PTY_UPDATED = "pty.updated"

/** Event: a PTY was deleted. */
export const EVENT_PTY_DELETED = "pty.deleted"

/** Event: a PTY exited. */
export const EVENT_PTY_EXITED = "pty.exited"

/** Event: an LSP server changed state. */
export const EVENT_LSP_UPDATED = "lsp.updated"

/** Event: LSP client diagnostics arrived. */
export const EVENT_LSP_CLIENT_DIAGNOSTICS = "lsp.client.diagnostics"

/** Event: installation state changed. */
export const EVENT_INSTALLATION_UPDATED = "installation.updated"

/** Event: an installation update is available. */
export const EVENT_INSTALLATION_UPDATE_AVAILABLE = "installation.update.available"

/** Event: a server connected. */
export const EVENT_SERVER_CONNECTED = "server.connected"

/** Event: a server instance was disposed. */
export const EVENT_SERVER_INSTANCE_DISPOSED = "server.instance.disposed"

/** Event: the VCS branch changed. */
export const EVENT_VCS_BRANCH_UPDATED = "vcs.branch.updated"

/** Event: the TUI appended text to the prompt. */
export const EVENT_TUI_PROMPT_APPEND = "tui.prompt.append"

/** Event: the TUI executed a command. */
export const EVENT_TUI_COMMAND_EXECUTE = "tui.command.execute"

/** Event: the TUI showed a toast. */
export const EVENT_TUI_TOAST_SHOW = "tui.toast.show"

// Stream events below come from OpenCode's live stream (delta/step/tool), not
// the SDK `Event` union — the plugin matches them by substring in events.ts.

/** Stream event: a text delta token streamed in. */
export const EVENT_TEXT_DELTA = "text.delta"

/** Stream event: a reasoning delta token streamed in. */
export const EVENT_REASONING_DELTA = "reasoning.delta"

/** Stream event: a generic part delta streamed in. */
export const EVENT_PART_DELTA = "part.delta"

/** Stream event: a step started. */
export const EVENT_STEP_STARTED = "step.started"

/** Stream event: a step ended. */
export const EVENT_STEP_ENDED = "step.ended"

/** Stream event: a step failed. */
export const EVENT_STEP_FAILED = "step.failed"

/** Stream event: a tool was called. */
export const EVENT_TOOL_CALLED = "tool.called"

/** Stream event: a tool call succeeded. */
export const EVENT_TOOL_SUCCESS = "tool.success"

/** Stream event: a tool call failed. */
export const EVENT_TOOL_FAILED = "tool.failed"

/** Stream event: a tool call ended. */
export const EVENT_TOOL_ENDED = "tool.ended"

/** Stream event: text streaming started. */
export const EVENT_TEXT_STARTED = "text.started"

/** Stream event: reasoning streaming started. */
export const EVENT_REASONING_STARTED = "reasoning.started"

/** Every OpenCode host event type the plugin recognizes: SDK set first, then stream events. */
export const EVENT_TYPES = [
  EVENT_MESSAGE_UPDATED,
  EVENT_MESSAGE_REMOVED,
  EVENT_MESSAGE_PART_UPDATED,
  EVENT_MESSAGE_PART_REMOVED,
  EVENT_SESSION_STATUS,
  EVENT_SESSION_IDLE,
  EVENT_SESSION_CREATED,
  EVENT_SESSION_UPDATED,
  EVENT_SESSION_DELETED,
  EVENT_SESSION_DIFF,
  EVENT_SESSION_COMPACTED,
  EVENT_SESSION_ERROR,
  EVENT_FILE_EDITED,
  EVENT_FILE_WATCHER_UPDATED,
  EVENT_TODO_UPDATED,
  EVENT_PERMISSION_UPDATED,
  EVENT_PERMISSION_REPLIED,
  EVENT_COMMAND_EXECUTED,
  EVENT_PTY_CREATED,
  EVENT_PTY_UPDATED,
  EVENT_PTY_DELETED,
  EVENT_PTY_EXITED,
  EVENT_LSP_UPDATED,
  EVENT_LSP_CLIENT_DIAGNOSTICS,
  EVENT_INSTALLATION_UPDATED,
  EVENT_INSTALLATION_UPDATE_AVAILABLE,
  EVENT_SERVER_CONNECTED,
  EVENT_SERVER_INSTANCE_DISPOSED,
  EVENT_VCS_BRANCH_UPDATED,
  EVENT_TUI_PROMPT_APPEND,
  EVENT_TUI_COMMAND_EXECUTE,
  EVENT_TUI_TOAST_SHOW,
  EVENT_TEXT_DELTA,
  EVENT_REASONING_DELTA,
  EVENT_PART_DELTA,
  EVENT_STEP_STARTED,
  EVENT_STEP_ENDED,
  EVENT_STEP_FAILED,
  EVENT_TOOL_CALLED,
  EVENT_TOOL_SUCCESS,
  EVENT_TOOL_FAILED,
  EVENT_TOOL_ENDED,
  EVENT_TEXT_STARTED,
  EVENT_REASONING_STARTED,
] as const

/** A single OpenCode host event `type` value. */
export type EventType = (typeof EVENT_TYPES)[number]
