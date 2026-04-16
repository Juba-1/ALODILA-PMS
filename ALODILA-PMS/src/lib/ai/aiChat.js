import { stringifyContextForPrompt } from './chatContext'
import { getViteGroqApiKey } from './groqEnv'
import { groqChatCompletions } from './groqChat'

/** JSON snapshot cap — rich admin/owner context (leases + financials). */
const CONTEXT_JSON_MAX_CHARS = 14_000

function buildSystemPrompt(userRole, contextData) {
  const ctx = stringifyContextForPrompt(contextData, CONTEXT_JSON_MAX_CHARS)

  const common = `
Output rules:
- Default language: Arabic (Saudi professional, concise). Match the user's language if they write in English or another language.
- Use ONLY the JSON snapshot below for facts (counts, names, money). If a figure is not in the snapshot, say you do not have it in the current context — do not invent.
- Prefer short paragraphs or bullet lists. No long preambles.
- Do not output raw JSON unless the user explicitly asks for it.
`.trim()

  if (userRole === 'super_admin') {
    return `You are the ALODILA-PMS assistant for the Super Admin: operations, portfolio overview, and in-app navigation.

Portfolio P&L: use "financials" (totalRevenueCollectedSar, totalMaintenanceOpexSar, netProfitAfterMaintenanceSar; month variants end with ThisCalendarMonth). Leases: "activeLeasesSummary". Owners and properties: "ownersSummary", "propertiesSummary".

${common}

SNAPSHOT (authoritative for this session):
${ctx}`
  }

  if (userRole === 'owner') {
    return `You are the ALODILA owner-portfolio assistant. The user is a property owner.

Scope: ONLY data in the JSON below (their linked properties, units, contracts, payments/maintenance summaries as provided). 
If asked about other owners, company-wide confidential totals, or anything outside this JSON, refuse briefly and say you only see their portfolio snapshot.
Money and net profit: use the "financials" object (totalRevenueCollectedSar, totalMaintenanceOpexSar, netProfitAfterMaintenanceSar, revenueThisCalendarMonthSar). Active leases: "activeLeasesSummary" (tenant, unit, property, rent_sar).

${common}

OWNER SNAPSHOT:
${ctx}`
  }

  return `You are the ALODILA-PMS assistant for staff (not Super Admin): day-to-day property management, navigation, and explaining workflows using the snapshot only.

Same snapshot shape as admin: "financials", "activeLeasesSummary", "ownersSummary", "propertiesSummary" when present.

${common}

STAFF SNAPSHOT:
${ctx}`
}

/** @param {Array<{ role: 'user'|'assistant', content: string }>} history */
function historyToOpenAiMessages(history) {
  const list = Array.isArray(history) ? history : []
  return list
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    }))
}

/**
 * @param {Array<{ role: 'user'|'assistant', content: string }>} history
 * @param {'super_admin'|'owner'|'staff'} userRole
 * @param {object} contextData
 */
export async function sendChatMessage({ history, userRole, contextData }) {
  const systemContent = buildSystemPrompt(userRole, contextData)
  const messages = [{ role: 'system', content: systemContent }, ...historyToOpenAiMessages(history)]

  try {
    // Production hardening: never ship Groq API keys in the browser.
    // - DEV: allow direct key for localhost convenience.
    // - PROD: call the Vercel serverless proxy (`/api/groq-chat`).
    const key = import.meta.env.DEV ? getViteGroqApiKey() : ''
    if (import.meta.env.DEV && key) {
      return await groqChatCompletions({
        apiKey: key,
        messages,
        temperature: 0.35,
        max_tokens: 2048,
      })
    }

    const res = await fetch('/api/groq-chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, temperature: 0.35, max_tokens: 2048 }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || `Groq proxy error (${res.status})`)
    return String(json?.text || '')
  } catch (e) {
    const msg = String(e?.message || e)
    const low = msg.toLowerCase()
    if (msg.includes('401') || (low.includes('invalid') && low.includes('api')) || low.includes('unauthorized')) {
      throw new Error('مفتاح Groq غير صالح أو مرفوض.')
    }
    throw e instanceof Error ? e : new Error(`Groq: ${msg.slice(0, 400)}`)
  }
}
