import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { centsToMoneyString, moneyToCents } from '../lib/money/cents'
import { cn } from './ui/cn'

function money(v) {
  return centsToMoneyString(moneyToCents(v))
}

function pct(n, d) {
  const num = Number(n) || 0
  const den = Number(d) || 0
  if (den <= 0) return 0
  return Math.max(-999, Math.min(999, (num / den) * 100))
}

function pctLabel(x) {
  const sign = x >= 0 ? '+' : '−'
  return `${sign}${Math.abs(x).toFixed(1)}%`
}

/**
 * Visual ROI / Cashflow widget for the Owner dashboard.
 *
 * Shows three headline figures (collected / maintenance / net) plus a stacked
 * progress bar indicating how much of the year's cashflow has been absorbed by
 * maintenance vs. retained as net profit. Computed in cents for precision.
 *
 * Fully i18n-aware: labels + currency come from the active locale.
 *
 * Props:
 *   totalRevenue:      number — total payments collected (SAR)
 *   totalMaintenance:  number — total maintenance spend (SAR)
 *   thisMonthRevenue?: number — optional current calendar-month collection
 *   currency?:         string — overrides the locale currency label
 */
export function OwnerRoiWidget({ totalRevenue = 0, totalMaintenance = 0, thisMonthRevenue = 0, currency }) {
  const { t } = useTranslation()
  const currencyLabel = currency ?? t('common.currencySar')
  const computed = useMemo(() => {
    const revCents = moneyToCents(totalRevenue)
    const maintCents = moneyToCents(totalMaintenance)
    const netCents = revCents - maintCents
    const roi = pct(netCents, revCents)
    const maintenanceShare = pct(maintCents, revCents)
    const netShare = 100 - Math.max(0, maintenanceShare)
    return {
      rev: revCents / 100,
      maint: maintCents / 100,
      net: netCents / 100,
      roi,
      maintenanceShare: Math.max(0, maintenanceShare),
      netShare: Math.max(0, Math.min(100, netShare)),
    }
  }, [totalRevenue, totalMaintenance])

  const netTone = computed.net >= 0 ? 'emerald' : 'red'
  const toneBg = {
    emerald: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    red: 'bg-red-50 text-red-900 ring-red-200',
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            {t('ownerRoi.netCashflowLabel')}
          </div>
          <div className="mt-1 text-3xl font-black text-slate-900">
            {money(computed.net)} <span className="text-base text-slate-400">{currencyLabel}</span>
          </div>
        </div>
        <div className={cn('rounded-full px-3 py-1 text-xs font-extrabold ring-1', toneBg[netTone])}>
          {t('ownerRoi.roiLabel')}: {pctLabel(computed.roi)}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${computed.netShare}%` }}
            aria-label={t('ownerRoi.netShareAria')}
          />
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${computed.maintenanceShare}%` }}
            aria-label={t('ownerRoi.maintShareAria')}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {t('ownerRoi.netShare')} {computed.netShare.toFixed(1)}%
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            {t('ownerRoi.maintenanceShare')} {computed.maintenanceShare.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <div className="text-[11px] font-bold text-emerald-700">{t('ownerRoi.collected')}</div>
          <div className="mt-1 text-lg font-extrabold text-emerald-900">
            {money(computed.rev)} <span className="text-xs text-emerald-700">{currencyLabel}</span>
          </div>
        </div>
        <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <div className="text-[11px] font-bold text-amber-800">{t('ownerRoi.maintenance')}</div>
          <div className="mt-1 text-lg font-extrabold text-amber-900">
            {money(computed.maint)} <span className="text-xs text-amber-800">{currencyLabel}</span>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-[11px] font-bold text-slate-600">{t('ownerRoi.thisMonth')}</div>
          <div className="mt-1 text-lg font-extrabold text-slate-900">
            {money(thisMonthRevenue)} <span className="text-xs text-slate-500">{currencyLabel}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
