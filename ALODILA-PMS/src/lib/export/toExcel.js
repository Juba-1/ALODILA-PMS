import * as XLSX from 'xlsx'

export function exportRowsToExcel(rows, filenameBase) {
  const base = String(filenameBase || 'export').replace(/[\\/:*?"<>|]+/g, '_')
  const name = base.toLowerCase().endsWith('.xlsx') ? base : `${base}.xlsx`
  const list = Array.isArray(rows) ? rows : []
  const sheetData = list.length ? list : [{ ملاحظة: 'لا توجد بيانات للتصدير' }]
  const ws = XLSX.utils.json_to_sheet(sheetData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'البيانات')
  XLSX.writeFile(wb, name)
}
