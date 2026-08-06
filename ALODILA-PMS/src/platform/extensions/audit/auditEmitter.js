/**
 * Audit emitter stub — stable API for a future durable audit store.
 * 2B: no-op in production; optional console in DEV.
 *
 * @param {{
 *   type: string,
 *   companyId?: string | null,
 *   actorUserId?: string | null,
 *   payload?: object,
 *   source?: string,
 * }} event
 */
export async function record(event) {
  const entry = {
    type: event?.type,
    companyId: event?.companyId ?? null,
    actorUserId: event?.actorUserId ?? null,
    at: new Date().toISOString(),
    payload: event?.payload || {},
    source: event?.source || 'platform_admin',
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[platform.audit]', entry)
  }
}
