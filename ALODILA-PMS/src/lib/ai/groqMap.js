import { createAiUnavailableError, getViteGroqApiKey } from './groqEnv'
import { groqChatCompletions } from './groqChat'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normStr(v) {
  return String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Remove ``` / ```json fences and outer whitespace. */
function stripMarkdownFences(text) {
  let s = String(text || '').trim()
  s = s.replace(/^```(?:json|JSON)?\s*/m, '')
  s = s.replace(/\s*```$/m, '')
  return s.trim()
}

function extractMappedRows(text) {
  const raw = stripMarkdownFences(text)
  if (!raw) throw new Error('Empty model response')

  const tryParse = (slice) => {
    try {
      return JSON.parse(slice)
    } catch {
      return null
    }
  }

  let parsed = tryParse(raw)
  if (parsed) {
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray(parsed.rows)) return parsed.rows
    if (parsed && Array.isArray(parsed.data)) return parsed.data
    if (parsed && Array.isArray(parsed.items)) return parsed.items
  }

  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start >= 0 && end > start) {
    parsed = tryParse(raw.slice(start, end + 1))
    if (parsed && Array.isArray(parsed)) return parsed
  }

  const objStart = raw.indexOf('{')
  const objEnd = raw.lastIndexOf('}')
  if (objStart >= 0 && objEnd > objStart) {
    parsed = tryParse(raw.slice(objStart, objEnd + 1))
    if (parsed && Array.isArray(parsed.rows)) return parsed.rows
  }

  throw new Error('Model did not return a usable JSON array of rows')
}

function flattenRawJsonText(rawJsonText) {
  const parsed = JSON.parse(String(rawJsonText || '{}'))
  const out = []
  for (const [sheetName, rows] of Object.entries(parsed || {})) {
    if (!Array.isArray(rows)) continue
    rows.forEach((row, idx) => {
      if (row && typeof row === 'object') {
        out.push({ __sheet: sheetName, __sheet_row: idx + 2, ...row })
      }
    })
  }
  return out
}

const SYSTEM_MAP = `You are the ALODILA enterprise import normalizer for Saudi real-estate Excel files.

You MUST respond with a single JSON object and nothing else.
Schema exactly:
{"rows":[
  {
    "source_index": number,
    "owner_name": string|null,
    "property_name": string|null,
    "unit_name": string|null,
    "tenant_full_name": string|null,
    "national_id_or_cr": string|null,
    "phone": string|null,
    "rent_value": number|null,
    "rooms_count": number|null,
    "_skip": boolean,
    "_flagged": boolean,
    "_reason": string
  }
]}

Rules:
- Return EXACTLY one output row per input object using the same source_index.
- Never drop rows. If a row is a header/total/noise, set "_skip": true and explain in "_reason".
- DO NOT set "_skip": true if the row contains ANY potentially valid business data such as a unit_name, rooms_count, rent_value, tenant name, phone, owner name, or property clue. Sparse rows are still valid import candidates and must remain in the output.
- If property_name is missing, set property_name to null and keep "_skip": false. The application can handle missing properties later via a fallback selection.
- Only use "_skip": true for undeniable non-data rows such as repeated column headers (example: "اسم المستأجر"), sheet titles, section separators, totals/subtotals, or completely empty/garbage rows with no usable import signal.
- Normalize obvious human spelling differences:
  Al Yasmin / Alyasmin / Al-yasmin / الياسمين => same normalized property string.
  Remove duplicate spaces, trim punctuation noise, normalize Arabic/English spacing.
- Extract hierarchy when possible: owner_name, property_name, unit_name, tenant_full_name.
- Monthly rent fields may appear as: rent, الإيجار, الايجار, الإيجار الشهري, قيمة الإيجار, الاجار, القيمة, المبلغ, مبلغ الإيجار, أجار, قيمة الايجار, Rent, Monthly.
- Tenant name may appear as: المستأجر, الاسم, اسم المستأجر, الاسم الكامل, Tenant, Name.
- National ID / CR may appear as: الهوية, رقم الهوية, السجل التجاري, CR, national id.
- Phone may appear as: الجوال, الهاتف, جوال, Mobile, Phone.
- Unit may appear as: وحدة, رقم الوحدة, اسم الوحدة, الشقة, Unit.
- Property may appear as: العقار, اسم العقار, البرج, العمارة, المبنى, Property, Building.
- Owner may appear as: المالك, اسم المالك, صاحب العقار, Owner.
- rooms_count should be integer >= 1 when known; if unknown use 1 and flag only if uncertainty matters.
- If a row has a useful unit/property but missing tenant or ID, keep it, do NOT skip it. Flag it if needed.
- A row with only unit_name plus rooms_count and/or rent_value is still a valid row. Keep it with missing fields set to null as needed.
- "_reason" must be short Arabic when flagged/skip; otherwise "".
`

function buildChunkUserContent(rows) {
  const compact = (rows || []).map((row, i) => ({
    source_index: Number(row.__source_index ?? i),
    sheet: row.__sheet || '',
    sheet_row: row.__sheet_row || '',
    data: row,
  }))
  return `Normalize the following chunk of messy Excel rows into the target schema.

Important:
- EXACTLY one output object per source_index.
- Keep source_index unchanged.

INPUT CHUNK:
${JSON.stringify(compact).slice(0, 120000)}`
}

function normalizeOutputRow(raw, fallback) {
  const row = raw && typeof raw === 'object' ? raw : {}
  const source_index = Number.isFinite(Number(row.source_index)) ? Number(row.source_index) : fallback.__source_index
  const reason = normStr(row._reason)
  const toNum = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const roomsNum = toNum(row.rooms_count)
  return {
    __source_index: source_index,
    __sheet: fallback.__sheet || '',
    __sheet_row: fallback.__sheet_row || '',
    owner_name: normStr(row.owner_name) || null,
    property_name: normStr(row.property_name) || null,
    unit_name: normStr(row.unit_name) || null,
    tenant_full_name: normStr(row.tenant_full_name) || null,
    national_id_or_cr: normStr(row.national_id_or_cr) || null,
    phone: normStr(row.phone) || null,
    rent_value: toNum(row.rent_value),
    rooms_count: roomsNum && roomsNum > 0 ? Math.floor(roomsNum) : 1,
    _skip: row._skip === true,
    _flagged: row._flagged === true || Boolean(reason),
    _reason: reason,
  }
}

async function mapChunkWithModel(rows) {
  const key = getViteGroqApiKey()
  if (!key) throw createAiUnavailableError()

  const userContent = buildChunkUserContent(rows)
  return groqChatCompletions({
    apiKey: key,
    messages: [
      { role: 'system', content: SYSTEM_MAP },
      { role: 'user', content: userContent },
    ],
    temperature: 0.1,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
  })
}

async function processChunkAdaptive(rows, chunkSize, attempt = 0) {
  try {
    const text = await mapChunkWithModel(rows.slice(0, chunkSize))
    return { ok: true, text, chunkSize }
  } catch (e) {
    const msg = String(e?.message || e)
    const lower = msg.toLowerCase()
    const throttled = msg.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')
    const tooLarge = msg.includes('413') || lower.includes('too large') || lower.includes('context') || lower.includes('payload')

    if (tooLarge && chunkSize > 1) {
      return processChunkAdaptive(rows, Math.max(1, Math.floor(chunkSize / 2)), attempt)
    }
    if (throttled && attempt < 4) {
      await sleep(600 * 2 ** attempt)
      return processChunkAdaptive(rows, chunkSize, attempt + 1)
    }
    throw e
  }
}

/**
 * Chunked enterprise AI import mapping with partial success.
 * Returns { rows, failedRows, chunks }
 */
export async function mapMessyDataWithAI({ rows, rawJsonText, onProgress } = {}) {
  const sourceRows = Array.isArray(rows) ? rows : flattenRawJsonText(rawJsonText)
  const normalizedInput = (sourceRows || [])
    .filter((row) => row && typeof row === 'object')
    .map((row, idx) => ({ __source_index: idx, ...row }))

  if (!normalizedInput.length) {
    return { rows: [], failedRows: [], chunks: [] }
  }

  const outputRows = []
  const failedRows = []
  const chunks = []

  let cursor = 0
  let dynamicChunkSize = 8

  while (cursor < normalizedInput.length) {
    const remaining = normalizedInput.slice(cursor)
    const desired = Math.max(1, Math.min(dynamicChunkSize, remaining.length))
    const chunkRows = remaining.slice(0, desired)
    onProgress?.({ phase: 'ai', processed: cursor, total: normalizedInput.length, chunkSize: desired })

    try {
      const { text, chunkSize } = await processChunkAdaptive(chunkRows, desired, 0)
      dynamicChunkSize = chunkSize
      const parsed = extractMappedRows(text)
      const byIndex = new Map()
      for (const raw of parsed || []) {
        const idx = Number(raw?.source_index)
        if (Number.isFinite(idx)) byIndex.set(idx, raw)
      }
      const normalizedChunk = chunkRows.map((src) => {
        const got = byIndex.get(src.__source_index)
        if (!got) {
          return normalizeOutputRow(
            { source_index: src.__source_index, _flagged: true, _reason: 'تعذر مطابقة هذا الصف آلياً وسيحتاج مراجعة.', _skip: false },
            src,
          )
        }
        return normalizeOutputRow(got, src)
      })
      outputRows.push(...normalizedChunk)
      chunks.push({ ok: true, count: chunkRows.length, from: cursor, to: cursor + chunkRows.length - 1 })
      cursor += chunkRows.length
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 300)
      const failedChunk = chunkRows.map((src) =>
        normalizeOutputRow(
          { source_index: src.__source_index, _flagged: true, _reason: `فشل تحليل هذا الصف: ${msg}`, _skip: false },
          src,
        ),
      )
      failedRows.push(...failedChunk)
      chunks.push({ ok: false, count: chunkRows.length, from: cursor, to: cursor + chunkRows.length - 1, error: msg })
      cursor += chunkRows.length
      await sleep(350)
    }
  }

  outputRows.sort((a, b) => a.__source_index - b.__source_index)
  failedRows.sort((a, b) => a.__source_index - b.__source_index)
  onProgress?.({ phase: 'ai', processed: normalizedInput.length, total: normalizedInput.length, done: true })

  return { rows: outputRows, failedRows, chunks }
}
