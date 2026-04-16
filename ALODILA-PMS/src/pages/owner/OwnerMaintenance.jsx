import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { ExportButton } from '../../components/ExportButton'
import { PrintPdfButton } from '../../components/PrintPdfButton'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getOwnerMaintenanceLedger } from '../../lib/db/ownerPortal'
import { formatMoneyLocale } from '../../lib/format/moneyLocale'
import { translateMaintenanceStatus } from '../../lib/i18n/domainLabels'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'

function dateOnly(ts) {
  const s = String(ts || '')
  return s.length >= 10 ? s.slice(0, 10) : s
}

export default function OwnerMaintenance() {
  const { ownerCrmId } = useOutletContext()
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const { push } = useToastDispatch()
  const [busy, setBusy] = useState(true)
  const [rows, setRows] = useState([])

  const ownerKey = ownerCrmId || ''
  const toastPushRef = useRef(push)
  toastPushRef.current = push
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const data = await getOwnerMaintenanceLedger(ownerCrmId)
        if (!cancelled) setRows(data || [])
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure((p) => toastPushRef.current?.(p), e, tRef.current('errors.loadMaintenance'), true)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ownerKey])

  const exportRows = useMemo(() => {
    return (rows || []).map((r) => ({
      [t('common.date')]: dateOnly(r.created_at),
      [t('common.property')]: r.property_name,
      [t('common.unit')]: r.unit_name,
      [t('owner.leaseholderSnapshot')]: r.active_tenant_name || '—',
      [t('common.description')]: r.description,
      [t('owner.cost')]: r.cost_amount,
      [t('common.status')]: translateMaintenanceStatus(r.status, lang),
    }))
  }, [rows, t, lang])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{t('owner.maintenanceTitle')}</CardTitle>
              <CardDescription>{t('owner.maintenanceDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={exportRows} filename={t('owner.maintenanceExportName')} disabled={busy} />
              <PrintPdfButton />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ) : rows.length === 0 ? (
            <div className="text-sm text-slate-500">{t('owner.noMaintenance')}</div>
          ) : (
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2">{t('common.date')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('common.property')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('common.unit')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('owner.leaseholderSnapshot')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('common.description')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('owner.cost')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="odd:bg-white even:bg-slate-50/80">
                      <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs">{dateOnly(r.created_at)}</td>
                      <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-900">{r.property_name}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{r.unit_name}</td>
                      <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{r.active_tenant_name || '—'}</td>
                      <td className="border-b border-slate-100 px-3 py-2 text-slate-800">{r.description}</td>
                      <td className="border-b border-slate-100 px-3 py-2 font-bold text-slate-900">
                        {formatMoneyLocale(r.cost_amount, lang)}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200">
                          {translateMaintenanceStatus(r.status, lang)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
