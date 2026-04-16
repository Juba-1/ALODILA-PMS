import { getGroqModelChain } from './groqEnv'

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'

function shouldTryNextGroqModel(status, message) {
  const m = String(message || '').toLowerCase()
  if (status === 404) return true
  if (status === 400 && (m.includes('model') || m.includes('invalid') || m.includes('does not exist'))) return true
  if (m.includes('decommissioned')) return true
  if (m.includes('no such model')) return true
  return false
}

async function postGroqChatOnce({ apiKey, model, messages, temperature, max_tokens, response_format }) {
  const key = String(apiKey || '').trim()
  if (!key) throw new Error('Groq API key is empty')

  const body = {
    model,
    messages,
    ...(temperature != null ? { temperature } : {}),
    ...(max_tokens != null ? { max_tokens } : {}),
    ...(response_format ? { response_format } : {}),
  }

  let response
  try {
    response = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    const msg = String(e?.message || e)
    throw new Error(`Groq: تعذر الاتصال — ${msg.slice(0, 240)}`)
  }

  let data
  try {
    data = await response.json()
  } catch {
    throw new Error(`Groq: استجابة غير صالحة (HTTP ${response.status}).`)
  }

  return { response, data }
}

function extractAssistantContent(data) {
  return String(data?.choices?.[0]?.message?.content ?? '').trim()
}

/**
 * Groq OpenAI-compatible chat completions.
 * @param {{ apiKey: string, model?: string, messages: Array<{ role: string, content: string }>, temperature?: number, max_tokens?: number, response_format?: { type: string } }} opts
 */
export async function groqChatCompletions({ apiKey, model, messages, temperature, max_tokens, response_format }) {
  const chain = model ? [model, ...getGroqModelChain().filter((x) => x !== model)] : getGroqModelChain()

  let lastError = null
  for (let i = 0; i < chain.length; i += 1) {
    const m = chain[i]
    const { response, data } = await postGroqChatOnce({
      apiKey,
      model: m,
      messages,
      temperature,
      max_tokens,
      response_format,
    })

    if (!response.ok) {
      const errBody = data?.error?.message || data?.message || response.statusText || String(response.status)
      const err = new Error(`Groq [${response.status}]: ${String(errBody).slice(0, 500)}`)
      const hasNext = i < chain.length - 1
      if (hasNext && shouldTryNextGroqModel(response.status, errBody)) {
        lastError = err
        continue
      }
      throw err
    }

    const trimmed = extractAssistantContent(data)
    if (!trimmed) {
      const reason = data?.choices?.[0]?.finish_reason
      if (reason === 'content_filter') {
        throw new Error('تم حظر الرد من قبل سياسات النموذج. جرّب صياغة أخرى.')
      }
      throw new Error('لم يُرجع النموذج نصاً صالحاً. تحقق من المفتاح أو حاول لاحقاً.')
    }

    return trimmed
  }

  throw lastError || new Error('Groq: فشلت جميع نماذج المحاولة.')
}
