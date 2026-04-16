function csvEscape(value) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * UTF-8 CSV with BOM for Excel; keys of first row become header (use translated labels as keys).
 * @param {Record<string, unknown>[]} rows
 * @param {string} filenameBase
 */
export function exportRowsToCsv(rows, filenameBase) {
  const base = String(filenameBase || 'export').replace(/[\\/:*?"<>|]+/g, '_')
  const name = base.toLowerCase().endsWith('.csv') ? base : `${base}.csv`
  const list = Array.isArray(rows) ? rows : []
  const data = list.length ? list : [{ ملاحظة: 'لا توجد بيانات للتصدير' }]
  const keys = Object.keys(data[0])
  const header = keys.map(csvEscape).join(',')
  const lines = data.map((row) => keys.map((k) => csvEscape(row[k])).join(','))
  const bom = '\uFEFF'
  const blob = new Blob([bom + header + '\n' + lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
