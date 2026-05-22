/**
 * Detail pane API convention:
 * - Route: GET /api/phr/patients/{patientId}/{module}/{id}
 *   (for example: /api/phr/patients/42/labs/7)
 * - Auth: enforce PhrPatientAccessService::accessiblePatient gating, same as list endpoints
 * - 404: when a requested record exists but does not belong to the selected patient
 * - Response: validate with a zod schema sibling to the module's list-response schema in `types.ts`
 */

export { PhrHomeView } from './PhrHomeView'
export { PhrMillerShell } from './PhrMillerShell'
export type { PhrModuleId, PhrRegistryEntry, PhrRenderProps, PhrShellState } from './phrModuleRegistry'
export { PHR_LIST_MODULES, PHR_MODULE_IDS, PHR_MODULE_IDS_SET, phrModuleRegistry } from './phrModuleRegistry'
export { PhrNotFoundColumn } from './PhrNotFoundColumn'
export { usePhrRoute } from './usePhrRoute'
