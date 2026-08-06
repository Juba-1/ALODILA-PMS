/** Allowed status transitions for Platform Admin (2B). */

const ALLOWED = {
  provisioning: new Set(['active', 'suspended']),
  active: new Set(['suspended']),
  suspended: new Set(['active']),
}

export class InvalidTransitionError extends Error {
  constructor(from, to) {
    super('INVALID_TRANSITION')
    this.name = 'InvalidTransitionError'
    this.code = 'INVALID_TRANSITION'
    this.from = from
    this.to = to
  }
}

export function canTransitionStatus(from, to) {
  const a = String(from || '')
  const b = String(to || '')
  return Boolean(ALLOWED[a]?.has(b))
}

export function assertTransition(from, to) {
  if (!canTransitionStatus(from, to)) {
    throw new InvalidTransitionError(from, to)
  }
}

export function suggestedLifecycleActions(company) {
  if (!company || company.is_deleted) {
    return { canSuspend: false, canActivate: false, canSoftDelete: false, canRestore: Boolean(company?.is_deleted) }
  }
  const status = company.status
  return {
    canSuspend: canTransitionStatus(status, 'suspended'),
    canActivate: canTransitionStatus(status, 'active'),
    canSoftDelete: true,
    canRestore: false,
  }
}
