import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { supabase } from '../../lib/supabase/client'
import {
  getOwnerActiveContracts,
  getOwnerProperties,
  getOwnerReportingBundle,
  getOwnerUnitsSummary,
} from '../../lib/db/ownerPortal'
import { formatMoneyLocale } from '../../lib/format/moneyLocale'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'
import { OwnerRoiWidget } from '../../components/OwnerRoiWidget'

function StatCard({ title, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md">
      <div className="text-xs font-bold text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-extrabold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}

export default function OwnerDashboard() {
  const { ownerCrmId } = useOutletContext()
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const { push } = useToastDispatch()
  const [busy, setBusy] = useState(true)
  const [properties, setProperties] = useState([])
  const [contracts, setContracts] = useState([])
  const [unitsSummary, setUnitsSummary] = useState({ totalUnits: 0, rentedUnits: 0 })
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalMaintenance, setTotalMaintenance] = useState(0)
  const [netRoiTotal, setNetRoiTotal] = useState(0)
  const [thisMonthRevenue, setThisMonthRevenue] = useState(0)

  const ownerKey = ownerCrmId || ''
  const toastPushRef = useRef(push)
  toastPushRef.current = push
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    let cancelled = false

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return
        void session
      })
      .catch((e) => {
        if (!isIgnorableAuthLockError(e)) console.warn('[OwnerDashboard] getSession', e)
      })

    ;(async () => {
      setBusy(true)
      try {
        const [props, cont, units, bundle] = await Promise.all([
          getOwnerProperties(ownerCrmId),
          getOwnerActiveContracts(ownerCrmId),
          getOwnerUnitsSummary(ownerCrmId),
          getOwnerReportingBundle(ownerCrmId),
        ])
        if (cancelled) return
        setProperties(props)
        setContracts(cont)
        setUnitsSummary(units)

        const s = bundle.summary || {}
        const rev = Number(s.totalPaymentsCollected ?? 0)
        const exp = Number(s.totalMaintenanceCost ?? 0)
        const net = Number(s.netCollectedMinusMaintenance ?? rev - exp)
        setTotalRevenue(rev)
        setTotalMaintenance(exp)
        setNetRoiTotal(net)
        setThisMonthRevenue(Number(s.paymentsThisCalendarMonth ?? 0))
      } catch (e) {
        reportLoadFailure((p) => toastPushRef.current?.(p), e, tRef.current('errors.loadData'), !cancelled)
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ownerKey])

  const topContracts = useMemo(() => contracts.slice(0, 8), [contracts])

  const netHint = t('owner.statNetRoiHint', {
    rev: formatMoneyLocale(totalRevenue, lang),
    maint: formatMoneyLocale(totalMaintenance, lang),
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('owner.dashboardTitle')}</CardTitle>
          <CardDescription>{t('owner.dashboardDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard title={t('owner.statProperties')} value={properties.length} />
              <StatCard title={t('owner.statUnits')} value={`${unitsSummary.rentedUnits} / ${unitsSummary.totalUnits}`} />
              <StatCard title={t('owner.statContracts')} value={contracts.length} />
              <StatCard title={t('owner.statNetRoi')} value={formatMoneyLocale(netRoiTotal, lang)} hint={netHint} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('owner.revenueCardTitle')}</CardTitle>
          <CardDescription>{t('owner.revenueCardDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ) : (
            <OwnerRoiWidget
              totalRevenue={totalRevenue}
              totalMaintenance={totalMaintenance}
              thisMonthRevenue={thisMonthRevenue}
            />
          )}
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold text-slate-900">
            <Link to="/owner/reports" className="hover:underline">
              {t('owner.viewReports')}
            </Link>
            <Link to="/owner/maintenance" className="hover:underline">
              {t('ownerNav.maintenance')}
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('owner.contractsPreviewTitle')}</CardTitle>
          <CardDescription>{t('owner.contractsPreviewDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : topContracts.length === 0 ? (
            <div className="text-sm text-slate-500">{t('owner.noActiveContracts')}</div>
          ) : (
            <ul className="space-y-2">
              {topContracts.map((c) => (
                <li key={c.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-sm font-bold text-slate-900">
                    {c.tenant_full_name} — {c.unit_name}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {c.property_name} — {c.start_date} → {c.end_date}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-800">
                    {t('owner.targetRentHint')}: {formatMoneyLocale(c.monthly_rent ?? c.rent_amount ?? 0, lang)} — {t('owner.contractValue')}:{' '}
                    {formatMoneyLocale(c.contract_value || 0, lang)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
