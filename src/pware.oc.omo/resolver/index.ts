/**
 * pware.oc.core.omo.resolver
 *
 * Aggregate of the omo resolvers: boulder/works/tasks/delegates, plan parsing,
 * the approval queue, the docs index and the omo config. Re-exports the entity
 * resolvers so consumers import from one module.
 */
export * from "./pware.oc.omo.resolver.boulder.js"
export * from "./pware.oc.omo.resolver.plan.js"
export * from "./pware.oc.omo.resolver.planFile.js"
export * from "./pware.oc.omo.resolver.draftFile.js"
export * from "./pware.oc.omo.resolver.notepadsFile.js"
export * from "./pware.oc.omo.resolver.proofFile.js"
export * from "./pware.oc.omo.resolver.rulesFile.js"
export * from "./pware.oc.omo.resolver.runContinuationFile.js"
export * from "./pware.oc.omo.resolver.approval.js"
export * from "./pware.oc.omo.resolver.approvalState.js"
export * from "./pware.oc.omo.resolver.doc.js"
export * from "./pware.oc.omo.resolver.config.js"
