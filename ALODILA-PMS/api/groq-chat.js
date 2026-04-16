/**
 * Vercel Serverless Function: Groq chat proxy.
 * - Keeps GROQ_API_KEY on the server (never in browser bundle).
 * - Minimal surface area: returns `{ text }` only.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

function json(res, statusCode, body) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return json(res, 500, { error: 'Missing GROQ_API_KEY on the server environment.' })

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}')
    const messages = Array.isArray(body.messages) ? body.messages : null
    if (!messages || messages.length === 0) return json(res, 400, { error: 'messages is required' })

    const temperature = Number(body.temperature)
    const maxTokens = Number(body.max_tokens)

    const payload = {
      model: String(body.model || 'llama-3.3-70b-versatile'),
      messages,
      temperature: Number.isFinite(temperature) ? temperature : 0.35,
      max_tokens: Number.isFinite(maxTokens) ? maxTokens : 2048,
    }

    const upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      const msg = data?.error?.message || `Upstream error (${upstream.status})`
      return json(res, 502, { error: msg })
    }

    const text = data?.choices?.[0]?.message?.content
    return json(res, 200, { text: typeof text === 'string' ? text : '' })
  } catch (e) {
    return json(res, 500, { error: String(e?.message || e).slice(0, 800) })
  }
}

