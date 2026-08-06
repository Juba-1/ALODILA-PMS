import { COMPANY_STATUSES } from './constants.js'
import { COMPANY_PLANS } from './companyPlan.js'

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const NAME_MAX = 200
export const SLUG_MAX = 63
export const NOTES_MAX = 2000

export function normalizeSlugInput(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function validateName(name) {
  const v = String(name ?? '').trim()
  if (!v) return 'nameRequired'
  if (v.length > NAME_MAX) return 'nameTooLong'
  return null
}

export function validateSlug(slug) {
  const v = String(slug ?? '').trim().toLowerCase()
  if (!v) return 'slugRequired'
  if (v.length > SLUG_MAX) return 'slugTooLong'
  if (!SLUG_REGEX.test(v)) return 'slugInvalid'
  return null
}

export function validateStatus(status) {
  const v = String(status ?? '').trim()
  if (!COMPANY_STATUSES.includes(v)) return 'statusInvalid'
  return null
}

export function validatePlan(plan) {
  const v = String(plan ?? '').trim().toLowerCase()
  if (!v) return 'planRequired'
  if (!COMPANY_PLANS.includes(/** @type {*} */ (v))) return 'planInvalid'
  return null
}

export function validateNotes(notes) {
  if (notes == null || notes === '') return null
  if (String(notes).length > NOTES_MAX) return 'notesTooLong'
  return null
}

export function validateEmail(email) {
  const v = String(email ?? '').trim().toLowerCase()
  if (!v) return 'emailRequired'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'emailInvalid'
  return null
}

export function validatePassword(password) {
  const v = String(password ?? '')
  if (!v) return 'passwordRequired'
  if (v.length < 6) return 'passwordTooShort'
  return null
}

/**
 * @returns {{ ok: true, value: object } | { ok: false, fields: Record<string, string> }}
 */
export function validateCreateInput(input) {
  const fields = {}
  const nameErr = validateName(input?.name)
  const slugErr = validateSlug(input?.slug)
  const notesErr = validateNotes(input?.notes)
  const status = input?.status != null && String(input.status).trim() !== '' ? String(input.status).trim() : 'active'
  const statusErr = validateStatus(status)
  const plan = input?.plan != null && String(input.plan).trim() !== '' ? String(input.plan).trim().toLowerCase() : 'trial'
  const planErr = validatePlan(plan)
  const emailErr = validateEmail(input?.loginEmail)
  const passErr = validatePassword(input?.password)
  const confirm = String(input?.confirmPassword ?? '')
  if (!passErr && confirm !== String(input?.password ?? '')) fields.confirmPassword = 'passwordMismatch'

  if (nameErr) fields.name = nameErr
  if (slugErr) fields.slug = slugErr
  if (notesErr) fields.notes = notesErr
  if (statusErr) fields.status = statusErr
  if (planErr) fields.plan = planErr
  if (emailErr) fields.loginEmail = emailErr
  if (passErr) fields.password = passErr

  if (Object.keys(fields).length) return { ok: false, fields }

  return {
    ok: true,
    value: {
      name: String(input.name).trim(),
      slug: String(input.slug).trim().toLowerCase(),
      notes: input.notes == null || String(input.notes).trim() === '' ? null : String(input.notes).trim(),
      status,
      plan,
      loginEmail: String(input.loginEmail).trim().toLowerCase(),
      password: String(input.password),
    },
  }
}

/**
 * @param {object} input
 * @param {{ lockName?: boolean, lockSlug?: boolean }} [locks]
 */
export function validateUpdateInput(input, locks = {}) {
  const fields = {}
  const value = {}

  if (!locks.lockName) {
    if ('name' in (input || {})) {
      const nameErr = validateName(input.name)
      if (nameErr) fields.name = nameErr
      else value.name = String(input.name).trim()
    }
  }

  if (!locks.lockSlug) {
    if ('slug' in (input || {})) {
      const slugErr = validateSlug(input.slug)
      if (slugErr) fields.slug = slugErr
      else value.slug = String(input.slug).trim().toLowerCase()
    }
  }

  if ('notes' in (input || {})) {
    const notesErr = validateNotes(input.notes)
    if (notesErr) fields.notes = notesErr
    else {
      value.notes =
        input.notes == null || String(input.notes).trim() === '' ? null : String(input.notes).trim()
    }
  }

  if ('plan' in (input || {})) {
    const planErr = validatePlan(input.plan)
    if (planErr) fields.plan = planErr
    else value.plan = String(input.plan).trim().toLowerCase()
  }

  if ('status' in (input || {}) && input.status != null && String(input.status).trim() !== '') {
    const statusErr = validateStatus(input.status)
    if (statusErr) fields.status = statusErr
    else value.status = String(input.status).trim()
  }

  if (Object.keys(fields).length) return { ok: false, fields }
  return { ok: true, value }
}
