/**
 * Vercel Serverless Function: Groq JSON-mapping proxy (Smart Import).
 * Returns `{ text }` (raw model text). Client parses JSON robustly.
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
    const system = String(body.system || '').trim()
    const user = String(body.user || '').trim()
    if (!system || !user) return json(res, 400, { error: 'system and user are required' })

    const temperature = Number(body.temperature)
    const maxTokens = Number(body.max_tokens)

    const payload = {
      model: String(body.model || 'llama-3.3-70b-versatile'),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: Number.isFinite(temperature) ? temperature : 0.12,
      max_tokens: Number.isFinite(maxTokens) ? maxTokens : 16384,
      response_format: { type: 'json_object' },
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

