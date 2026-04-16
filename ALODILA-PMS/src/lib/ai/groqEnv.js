/**
 * Groq Cloud — OpenAI-compatible chat completions (no Google / no OpenRouter).
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

export function getViteGroqApiKey() {
  const raw = import.meta.env.VITE_GROQ_API_KEY
  if (raw == null) return ''
  return String(raw).trim()
}

export function hasViteGroqApiKey() {
  return getViteGroqApiKey().length > 0
}
