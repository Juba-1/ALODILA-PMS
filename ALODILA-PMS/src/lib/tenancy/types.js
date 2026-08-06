/**
 * @typedef {'jwt_company_id' | 'jwt_owner_company_id' | 'assume_company' | 'legacy_default_alodila' | 'none'} CompanyResolutionSource
 */

/**
 * @typedef {'company' | 'owner' | 'platform_super_admin' | 'staff_legacy'} TenancyPersona
 */

/**
 * @typedef {object} CompanyResolution
 * @property {string | null} companyId
 * @property {CompanyResolutionSource} source
 * @property {TenancyPersona} persona
 * @property {boolean} isDefaulted
 */

/**
 * @typedef {'single' | 'none' | 'owner_bounded'} ReadScopeMode
 */

/**
 * @typedef {object} ReadScope
 * @property {ReadScopeMode} mode
 * @property {string[]} companyIds
 * @property {string | null} ownerCrmId
 * @property {false} allowUnscoped
 */

/**
 * @typedef {object} WriteCompany
 * @property {string | null} companyId
 * @property {CompanyResolutionSource} source
 * @property {boolean} allowWrite
 * @property {string | null} reasonIfDenied
 */

export {}
