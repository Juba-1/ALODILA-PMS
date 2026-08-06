/** Normalize mutation payloads — never includes id. Plan is encoded into notes. */

import { encodeNotesPlan } from './companyPlan.js'

export function buildCreatePayload(validated) {
  return {
    name: validated.name,
    slug: validated.slug,
    status: validated.status || 'active',
    notes: encodeNotesPlan(validated.notes, validated.plan),
    is_deleted: false,
    auth_user_id: null,
  }
}

export function buildUpdatePayload(validated) {
  const payload = {}
  if ('name' in validated) payload.name = validated.name
  if ('slug' in validated) payload.slug = validated.slug
  if ('notes' in validated || 'plan' in validated) {
    const notesBody = 'notes' in validated ? validated.notes : null
    const plan = 'plan' in validated ? validated.plan : undefined
    // When only notes or only plan provided, caller should pass both resolved values.
    payload.notes = encodeNotesPlan(notesBody, plan)
  }
  return payload
}
