/** @typedef {{ contract_value?: unknown, utility_payment_type?: string | null, utility_flat_amount_sar?: unknown }} ContractLike */

/**
 * Monthly rent line for invoicing: base rent plus fixed utility charge when type is `مقطوع`.
 * Other utility modes do not add a landlord-side line item here (tenant pays separately / shared / included in rent).
 * @param {ContractLike | null | undefined} c
 * @returns {number}
 */
export function suggestedInvoiceSubtotalFromContract(c) {
  if (!c) return 0
  const rent = Number(c.contract_value)
  const baseRent = Number.isFinite(rent) && rent >= 0 ? rent : 0
  if (c.utility_payment_type !== 'مقطوع') return Math.round(baseRent * 100) / 100
  const flat = Number(c.utility_flat_amount_sar)
  const add = Number.isFinite(flat) && flat > 0 ? flat : 0
  return Math.round((baseRent + add) * 100) / 100
}
