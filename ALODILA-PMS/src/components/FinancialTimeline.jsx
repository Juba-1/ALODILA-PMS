import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { classifyInstallment, todayIso } from '../lib/finance/schedule'
import { centsToMoneyString, moneyToCents } from '../lib/money/cents'
import { cn } from './ui/cn'

const STATUS_STYLES = {
  paid: {
    dot: 'bg-emerald-500 ring-emerald-200',
    row: 'border-emerald-200 bg-emerald-50/60',
    badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    labelKey: 'timeline.paid',
  },
  partial: {
    dot: 'bg-amber-400 ring-amber-200',
    row: 'border-amber-200 bg-amber-50/60',
    badge: 'bg-amber-100 text-amber-900 ring-amber-200',
    labelKey: 'timeline.partial',
  },
  overdue: {
    dot: 'bg-red-500 ring-red-200',
    row: 'border-red-200 bg-red-50/60',
    badge: 'bg-red-100 text-red-800 ring-red-200',
    labelKey: 'timeline.overdue',
  },
  pending: {
    dot: 'bg-slate-400 ring-slate-200',
    row: 'border-slate-200 bg-white',
    badge: 'bg-slate-100 text-slate-700 ring-slate-200',
    labelKey: 'timeline.pending',
  },
}

function money(v) {
  return centsToMoneyString(moneyToCents(v))
}

/**
 * Visual "Financial Timeline" for a contract — one row per invoice/installment.
 * Color-coded by status (paid / partial / overdue / pending) and clickable
 * straight into the dedicated invoice detail page. Fully bilingual.
 *
 * Props:
 *   invoices: Array<{ id, due_date, total_amount, paid_amount, payments? }>
 *   summary:  { totalInvoiced, totalPaid, outstanding, ... }
 *   currency: optional override; defaults to i18n-aware "SAR"/"ر.س"
 */
export function FinancialTimeline({ invoices = [], summary, currency }) {
  const { t } = useTranslation()
  const now = todayIso()
  const currencyLabel = currency ?? t('common.currencySar')

  const enriched = useMemo(() => {
    return (invoices || []).map((inv, idx) => {
      const status = classifyInstallment(inv, now)
      const styles = STATUS_STYLES[status] || STATUS_STYLES.pending
      return { ...inv, _status: status, _styles: styles, _order: idx + 1 }
    })
  }, [invoices, now])

  const paid = summary?.paidCount ?? enriched.filter((e) => e._status === 'paid').length
  const overdue = summary?.overdueCount ?? enriched.filter((e) => e._status === 'overdue').length
  const pending = summary
    ? ((summary.pendingCount ?? 0) + (summary.partialCount ?? 0))
    : enriched.filter((e) => e._status === 'pending' || e._status === 'partial').length

  if (!enriched.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
        {t('timeline.emptyState')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">{t('timeline.paid')}</div>
          <div className="mt-1 text-xl font-black text-emerald-900">{paid}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">{t('timeline.pending')}</div>
          <div className="mt-1 text-xl font-black text-slate-900">{pending}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-red-700">{t('timeline.overdue')}</div>
          <div className="mt-1 text-xl font-black text-red-900">{overdue}</div>
        </div>
      </div>

      <ol className="relative space-y-3 ps-6">
        <span
          className="absolute inset-y-2 start-[7px] w-px bg-gradient-to-b from-slate-200 via-slate-200 to-transparent"
          aria-hidden="true"
        />
        {enriched.map((inst) => {
          const styles = inst._styles
          const paidAmount = Number(inst.paid_amount ?? 0)
          const remaining = Math.max(0, Number(inst.total_amount || 0) - paidAmount)
          return (
            <li key={inst.id || inst._order} className="relative">
              <span
                aria-hidden="true"
                className={cn('absolute -start-[17px] top-4 inline-flex h-4 w-4 rounded-full ring-4', styles.dot)}
              />
              <div className={cn('rounded-2xl border p-4 shadow-sm transition hover:shadow-md', styles.row)}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs font-extrabold text-slate-500">#{inst._order}</span>
                    <span className="text-sm font-extrabold text-slate-900">
                      {t('timeline.due')}: {inst.due_date}
                    </span>
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1',
                        styles.badge,
                      )}
                    >
                      {t(styles.labelKey)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="text-slate-700">
                      {t('timeline.total')}:{' '}
                      <span className="font-extrabold text-slate-900">
                        {money(inst.total_amount)} {currencyLabel}
                      </span>
                    </div>
                    {inst.id ? (
                      <Link
                        to={`/invoices/${inst.id}`}
                        className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold text-white hover:bg-slate-800"
                      >
                        {t('timeline.viewInvoice')}
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-3">
                  <div>
                    {t('timeline.collected')}: <span className="font-extrabold text-emerald-700">{money(paidAmount)}</span>
                  </div>
                  <div>
                    {t('timeline.remaining')}:{' '}
                    <span className={cn('font-extrabold', remaining > 0 ? 'text-amber-700' : 'text-slate-500')}>
                      {money(remaining)}
                    </span>
                  </div>
                  <div>
                    {t('timeline.base')}:{' '}
                    <span className="font-extrabold text-slate-900">{money(inst.subtotal_amount)}</span>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
