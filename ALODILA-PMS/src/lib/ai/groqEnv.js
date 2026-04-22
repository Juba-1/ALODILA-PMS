/**
 * Groq Cloud environment helpers.
 *
 * Policy (Vercel + Vite):
 * - Browser code MUST use `import.meta.env.VITE_GROQ_API_KEY` only. Vite inlines
 *   this token at build time, so Vercel deployments just need that one env var
 *   on the Vercel project (same name, `VITE_GROQ_API_KEY`).
 * - If the key is missing we NEVER crash — every AI surface has to check
 *   `isAiAvailable()` first and render a clean fallback banner instead.
 *
 * @see https://console.groq.com/docs/api-reference#chat-create
 */

/** Default chain: strong Arabic + JSON; fast fallback. Override with VITE_GROQ_MODEL. */
export const GROQ_MODEL_FALLBACKS = ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'llama-3.1-8b-instant']

export function getGroqModelChain() {
  const primary = String(import.meta.env.VITE_GROQ_MODEL ?? '').trim()
  const chain = []
  if (primary) chain.push(primary)
  for (const m of GROQ_MODEL_FALLBACKS) {
    if (!chain.includes(m)) chain.push(m)
  }
  return chain.length ? chain : [...GROQ_MODEL_FALLBACKS]
}

/** Returns the Vite-time Groq API key, trimmed. Empty string when missing. */
export function getViteGroqApiKey() {
  const raw = import.meta.env.VITE_GROQ_API_KEY
  if (raw == null) return ''
  return String(raw).trim()
}

/** True when a non-empty Vite Groq key is present in the build. */
export function hasViteGroqApiKey() {
  return getViteGroqApiKey().length > 0
}

/** Stable alias used by new AI surfaces (chat, advisor, smart-import). */
export function isAiAvailable() {
  return hasViteGroqApiKey()
}

/** User-facing message shown whenever the key is missing. */
export const AI_UNAVAILABLE_MESSAGE_AR =
  'ميزات الذكاء الاصطناعي غير متاحة حالياً. يرجى تهيئة مفاتيح الـ API في الإعدادات.'
export const AI_UNAVAILABLE_MESSAGE_EN =
  'AI features are currently unavailable. Please configure the API keys in the settings.'

/**
 * Builds a friendly "AI unavailable" Error. Callers can catch `err.code === 'AI_UNAVAILABLE'`
 * to render the banner without treating this as an unexpected crash.
 */
export function createAiUnavailableError(lang = 'ar') {
  const normalized = String(lang || 'ar').toLowerCase().startsWith('en') ? 'en' : 'ar'
  const message = normalized === 'en' ? AI_UNAVAILABLE_MESSAGE_EN : AI_UNAVAILABLE_MESSAGE_AR
  const err = new Error(message)
  err.code = 'AI_UNAVAILABLE'
  return err
}

/** True if an error was raised because the Vite Groq API key is missing. */
export function isAiUnavailableError(err) {
  return Boolean(err) && err.code === 'AI_UNAVAILABLE'
}
