/**
 * pware.oc.core.omo.resolver
 *
 * Aggregate of the omo resolvers: boulder/works/tasks/delegates, plan parsing,
 * the approval queue, the docs index and the omo config. Re-exports the entity
 * resolvers so consumers import from one module.
 */
export * from "./boulder.resolver.js"
export * from "./plan.resolver.js"
export * from "./approval.resolver.js"
export * from "./doc.resolver.js"
export * from "./config.resolver.js"
