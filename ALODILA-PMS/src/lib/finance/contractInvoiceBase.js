import { perInstallmentSubtotalFromContract } from './schedule'

/**
 * Suggested subtotal for a single, manually-issued invoice against a contract.
 *
 * `contract_value` is the TOTAL rent for the whole lease (see `schedule.js`),
 * so we derive the per-installment amount from the billing cycle + dates and
 * include the monthly flat utility spread when `utility_payment_type === 'مقطوع'`.
 *
 * @param {{
 *   contract_value?: unknown,
 *   start_date?: string|null,
 *   end_date?: string|null,
 *   billing_cycle?: string|null,
 *   utility_payment_type?: string|null,
 *   utility_flat_amount_sar?: unknown,
 * } | null | undefined} c
 * @returns {number}
 */
export function suggestedInvoiceSubtotalFromContract(c) {
  return perInstallmentSubtotalFromContract(c)
}
