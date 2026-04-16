/** DB / business layer stores Arabic lifecycle labels — map for English UI only. */

const MAINTENANCE_STATUS_EN = {
  مفتوح: 'Open',
  'قيد المعالجة': 'In progress',
  مكتمل: 'Completed',
}

const INVOICE_PAYMENT_STATUS_EN = {
  'غير مدفوعة': 'Unpaid',
  'مدفوعة جزئياً': 'Partially paid',
  'مدفوعة بالكامل': 'Paid in full',
}

export function translateMaintenanceStatus(status, lang) {
  if (!status) return ''
  if (lang !== 'en') return String(status)
  return MAINTENANCE_STATUS_EN[status] || status
}

export function translateInvoicePaymentStatus(status, lang) {
  if (!status) return ''
  if (lang !== 'en') return String(status)
  return INVOICE_PAYMENT_STATUS_EN[status] || status
}
