import { createAiUnavailableError, getViteGroqApiKey } from './groqEnv'
import { groqChatCompletions } from './groqChat'
import { monthsBetween } from '../finance/schedule'

const SYSTEM_ADVISOR = `You are "الراكائز — المستشار المالي الذكي" for a Saudi property-management SaaS.
You receive a JSON snapshot about ONE lease contract (tenant, unit, schedule, totals, overdue counts).
Produce a SHORT Arabic executive summary (3 to 5 bullet points max) for the property manager:
- Reference the total contract value and, where useful, the monthly-equivalent cashflow (ر.س).
- Mention billing frequency (شهري / ربع سنوي / نصف سنوي / سنوي) clearly.
- Flag overdue installments prominently with a recommended action (مثال: إرسال تذكير، تواصل مباشر، خصم من التأمين عند الضرورة).
- Note collection health (paid vs total) and highlight upcoming due dates within the next 14 days when present.
- Never invent figures. If a field is missing, skip it silently.
- Keep it professional, concise, actionable. No markdown headings, no JSON. Bullets allowed.
If the snapshot indicates no installments at all, politely recommend generating the payment schedule.`

function safeNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Build the compact snapshot the advisor sees. We strip anything that could
 * leak other tenants/owners. Kept intentionally tiny so it fits the free Groq
 * tier even on big portfolios.
 */
function buildAdvisorSnapshot({ contract, invoices = [], summary = {} }) {
  const totalContract = safeNumber(contract?.contract_value)
  const months = contract?.start_date && contract?.end_date ? monthsBetween(contract.start_date, contract.end_date) : 0
  const monthly = months > 0 ? Math.round((totalContract / months) * 100) / 100 : 0
  const flat = contract?.utility_payment_type === 'مقطوع' ? safeNumber(contract?.utility_flat_amount_sar) : 0
  const nowIso = new Date().toISOString().slice(0, 10)
  const upcoming = (invoices || [])
    .filter((i) => i?.due_date && i.due_date >= nowIso)
    .slice(0, 6)
    .map((i) => ({
      due_date: i.due_date,
      total_sar: safeNumber(i.total_amount),
      paid_sar: safeNumber(i.paid_amount),
    }))
  const recentlyOverdue = (invoices || [])
    .filter((i) => safeNumber(i.paid_amount) < safeNumber(i.total_amount) && i?.due_date && i.due_date < nowIso)
    .slice(-5)
    .map((i) => ({
      due_date: i.due_date,
      total_sar: safeNumber(i.total_amount),
      paid_sar: safeNumber(i.paid_amount),
    }))

  return {
    contract: {
      id: contract?.id || null,
      tenant: contract?.tenant?.full_name || null,
      unit: contract?.unit?.unit_name || null,
      property: contract?.unit?.property?.name || null,
      start_date: contract?.start_date || null,
      end_date: contract?.end_date || null,
      billing_cycle: contract?.billing_cycle || null,
      status: contract?.status || null,
      total_contract_value_sar: totalContract,
      lease_months: months,
      monthly_rent_equivalent_sar: monthly,
      monthly_utility_flat_sar: flat,
      effective_monthly_sar: monthly + flat,
      utility_payment_type: contract?.utility_payment_type || null,
    },
    totals: {
      invoice_count: summary?.invoiceCount ?? invoices.length,
      total_invoiced_sar: safeNumber(summary?.totalInvoiced),
      total_paid_sar: safeNumber(summary?.totalPaid),
      outstanding_sar: safeNumber(summary?.outstanding),
      paid_count: summary?.paidCount ?? 0,
      pending_count: summary?.pendingCount ?? 0,
      overdue_count: summary?.overdueCount ?? 0,
      partial_count: summary?.partialCount ?? 0,
    },
    upcoming_installments: upcoming,
    recently_overdue_installments: recentlyOverdue,
    as_of: nowIso,
  }
}

/**
 * Builds a deterministic offline narrative so the UI never shows "تعذر تحميل
 * المستشار" when there is simply nothing useful to say yet (brand-new contract,
 * no invoices generated, etc.). Groq is reserved for cases where there is real
 * signal to summarise.
 */
function buildFallbackNarrative(snapshot) {
  const lines = []
  const c = snapshot.contract || {}
  const t = snapshot.totals || {}

  if (!t.invoice_count) {
    lines.push('• لم يتم توليد جدول الدفعات بعد — يُنصح بإنشاء الجدول من تفاصيل العقد لبدء التحصيل الذكي.')
  }
  if (c.total_contract_value_sar > 0 && c.lease_months > 0) {
    lines.push(
      `• قيمة العقد الإجمالية ${c.total_contract_value_sar.toLocaleString('ar-SA-u-nu-latn')} ر.س لمدة ${c.lease_months} شهر (ما يعادل شهرياً: ${(c.monthly_rent_equivalent_sar || 0).toLocaleString('ar-SA-u-nu-latn')} ر.س).`,
    )
  }
  if (c.billing_cycle) {
    lines.push(`• دورة الدفع المعتمدة: ${c.billing_cycle}.`)
  }
  if (t.invoice_count > 0) {
    lines.push(
      `• حالة التحصيل: ${(t.total_paid_sar || 0).toLocaleString('ar-SA-u-nu-latn')} ر.س من أصل ${(t.total_invoiced_sar || 0).toLocaleString('ar-SA-u-nu-latn')} ر.س — المتبقي ${(t.outstanding_sar || 0).toLocaleString('ar-SA-u-nu-latn')} ر.س.`,
    )
  }
  if (t.overdue_count > 0) {
    lines.push(`• ${t.overdue_count} دفعة متأخرة — يُنصح بإرسال تذكير فوري أو التواصل المباشر مع المستأجر.`)
  }
  if (!lines.length) {
    lines.push('• لا توجد بيانات كافية بعد لاستخراج ملخص مفصل. أكمل توليد الدفعات أو سجّل المدفوعات لرؤية نصائح أدق.')
  }
  return lines.join('\n')
}

/** True when the snapshot has no meaningful financial signal to reason about. */
function snapshotHasNoSignal(snapshot) {
  const c = snapshot.contract || {}
  const t = snapshot.totals || {}
  const hasContractShape = (c.total_contract_value_sar || 0) > 0 && (c.lease_months || 0) > 0
  const hasFinanceSignal =
    (t.invoice_count || 0) > 0 ||
    (t.total_invoiced_sar || 0) > 0 ||
    (t.total_paid_sar || 0) > 0 ||
    (t.outstanding_sar || 0) > 0
  return !hasContractShape && !hasFinanceSignal
}

/**
 * Returns a short Arabic narrative summary of the contract's financial state.
 *
 * Robustness contract:
 * - Throws `AI_UNAVAILABLE` when Groq key is missing (caller renders a banner).
 * - On sparse data, returns an offline deterministic summary — we never send a
 *   near-empty JSON to Groq, which could produce hallucinated or refusal text.
 * - On network/model failure, falls back to the same deterministic summary
 *   instead of crashing the detail page.
 */
export async function summarizeContractFinance(input) {
  const key = getViteGroqApiKey()
  if (!key) throw createAiUnavailableError()

  const snapshot = buildAdvisorSnapshot(input || {})

  if (snapshotHasNoSignal(snapshot)) {
    return buildFallbackNarrative(snapshot)
  }

  const userContent = `حلل المشهد المالي لهذا العقد وقدّم ملخصاً قابلاً للتنفيذ:\n\n${JSON.stringify(snapshot, null, 2)}`

  try {
    const text = await groqChatCompletions({
      apiKey: key,
      messages: [
        { role: 'system', content: SYSTEM_ADVISOR },
        { role: 'user', content: userContent },
      ],
      temperature: 0.25,
      max_tokens: 600,
    })
    const trimmed = String(text || '').trim()
    return trimmed || buildFallbackNarrative(snapshot)
  } catch {
    return buildFallbackNarrative(snapshot)
  }
}
