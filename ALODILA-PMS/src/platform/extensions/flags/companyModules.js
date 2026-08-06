import { MODULE_KEYS } from './featureFlagTypes.js'

/**
 * Placeholder defaults: modules exist in the control plane UI but are not configurable yet.
 * All start disabled (false) until a future flags store exists.
 */
function defaultModules() {
  const modules = {}
  for (const key of MODULE_KEYS) modules[key] = false
  return modules
}

/**
 * Reserved accessor — in-memory defaults only (read-only; no persistence).
 * @param {string} companyId
 */
export function getCompanyModules(companyId) {
  return {
    companyId: String(companyId || ''),
    modules: defaultModules(),
    configurable: false,
  }
}

export function isModuleEnabled(companyId, moduleKey) {
  const pack = getCompanyModules(companyId)
  return Boolean(pack.modules[moduleKey])
}

export function listModuleEntries(companyId) {
  const pack = getCompanyModules(companyId)
  return MODULE_KEYS.map((key) => ({
    key,
    enabled: Boolean(pack.modules[key]),
    configurable: pack.configurable,
  }))
}
