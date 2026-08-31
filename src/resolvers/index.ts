/**
 * pware.oc.core.resolver
 *
 * Public resolver barrel — one import for the whole resolution layer:
 * opencode (SQLite), omo (boulder/docs/approvals), live composition and the
 * My work queue.
 */
export * from "./opencode/index.js"
export * from "./omo/index.js"
export * from "./live/index.js"
export * from "./mywork.resolver.js"
