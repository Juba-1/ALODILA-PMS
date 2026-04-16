function safeAmount(n) {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

export function sumPaid(invoice) {
  const list = Array.isArray(invoice?.payments) ? invoice.payments : []
  return list.filter((p) => p && p.is_deleted !== true).reduce((s, p) => s + safeAmount(p?.amount), 0)
}

export function paymentStatusOfInvoice(invoice) {
  const total = safeAmount(invoice?.total_amount)
  const paid = sumPaid(invoice)
  if (total <= 0) return 'غير مدفوعة'
  if (paid <= 0) return 'غير مدفوعة'
  if (paid > 0 && paid < total) return 'مدفوعة جزئياً'
  return 'مدفوعة بالكامل'
}

export function remainingOnInvoice(invoice) {
  const total = safeAmount(invoice?.total_amount)
  const paid = sumPaid(invoice)
  const v = total - paid
  return Number.isFinite(v) ? Math.max(0, v) : 0
}
