/**
 * pware.oc.opencode.constants.filetouch
 *
 * OpenCode file-touch kinds: whether a tool call reads or writes a file.
 * Classified in `pware.oc.opencode/pware.oc.opencode.files.ts`.
 */

/** File touch: the tool read/viewed the file. */
export const FILE_TOUCH_READ = "read"

/** File touch: the tool wrote/deleted the file. */
export const FILE_TOUCH_WRITE = "write"

/** Every file-touch kind. */
export const FILE_TOUCHES = [FILE_TOUCH_READ, FILE_TOUCH_WRITE] as const

/** A file-touch kind. */
export type FileTouch = (typeof FILE_TOUCHES)[number]
