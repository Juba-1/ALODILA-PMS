import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ExportButton } from '../../components/ExportButton'
import { TargetedPdfButton } from '../../components/TargetedPdfButton'
import { ManagerBadge } from '../../components/ManagerBadge'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { EmptyState } from '../../components/ui/EmptyState'
import { getActiveProperties, softDeleteProperty } from '../../lib/db/properties'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'
import { exportReportPdf } from '../../lib/print/targetedPdf'

export default function PropertiesList() {
  const { t, i18n } = useTranslation()
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'
  const { push } = useToastDispatch()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const typeLabel = (raw) => {
    if (raw === 'Residential') return t('propertiesList.typeResidential')
    if (raw === 'Commercial') return t('propertiesList.typeCommercial')
    if (raw === 'Mixed') return t('propertiesList.typeMixed')
    return raw || ''
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setBusy(true)
        setError(null)
        const data = await getActiveProperties()
        if (mounted) setItems(data)
      } catch (e) {
        if (mounted && !isIgnorableAuthLockError(e)) {
          setError(e?.message || t('errors.generic'))
        }
      } finally {
        if (mounted) setBusy(false)
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSoftDelete(id) {
    const ok = window.confirm(t('propertiesList.confirmHide'))
    if (!ok) return

    setError(null)
    setDeletingId(id)
    try {
      await softDeleteProperty(id)
      setItems((prev) => prev.filter((p) => p.id !== id))
      push({ type: 'success', title: t('propertiesList.toastHiddenTitle'), message: t('propertiesList.toastHiddenMsg') })
    } catch (e) {
      if (!isIgnorableAuthLockError(e)) {
        setError(e?.message || t('propertiesList.toastDeleteFail'))
      }
      reportLoadFailure(push, e, t('propertiesList.toastHideFail'), true)
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = items.filter((p) => {
    const hay = `${p.name || ''} ${p.category || ''} ${p.type || ''} ${p.deed_number || ''} ${p.assigned_manager || ''}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })

  const exportRows = useMemo(() => {
    return filtered.map((p) => ({
      [t('propertiesList.colName')]: p.name,
      [t('propertiesList.colCategory')]: p.category,
      [t('propertiesList.colType')]: typeLabel(p.type),
      [t('propertiesList.colDeed')]: p.deed_number || '',
      [t('propertiesList.colMap')]: p.maps_link || '',
      [t('propertiesList.colCapacity')]: p.total_units_capacity,
      [t('propertiesList.colAssignedManager')]: p.assigned_manager || '',
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, i18n.language])

  return (
    <div className="max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>{t('propertiesList.pageTitle')}</CardTitle>
              <CardDescription>{t('propertiesList.pageDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <ExportButton rows={exportRows} filename={t('propertiesList.exportFilename')} disabled={busy} />
              <ExportButton rows={exportRows} filename={t('propertiesList.exportFilename')} format="csv" disabled={busy} />
              <TargetedPdfButton
                disabled={busy}
                onClick={() =>
                  exportReportPdf({
                    title: t('propertiesList.pdfTitle'),
                    subtitle: t('propertiesList.pdfSubtitle'),
                    filename: 'properties',
                    metaLines: [
                      `${t('common.date')}: ${new Date().toISOString().slice(0, 10)}`,
                      `${t('contractsList.pdfRowsLabel')}: ${exportRows.length}`,
                    ],
                    rows: exportRows,
                    dir,
                  })
                }
              />
              <Link to="/company/properties/new">
                <Button variant="gold">{t('propertiesList.newProperty')}</Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>{t('propertiesList.searchLabel')}</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('propertiesList.searchPlaceholder')} />
            </div>
            <div className="flex items-end">
              <div className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                {t('propertiesList.totalLabel')}: <span className="font-bold text-slate-900">{filtered.length}</span>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</div>
          ) : null}

          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-start text-xs font-bold text-slate-600">
                    <th className="px-4 py-3">{t('propertiesList.colName')}</th>
                    <th className="px-4 py-3">{t('propertiesList.colCategory')}</th>
                    <th className="px-4 py-3">{t('propertiesList.colType')}</th>
                    <th className="px-4 py-3">{t('propertiesList.colAssignedManager')}</th>
                    <th className="px-4 py-3">{t('propertiesList.colDeed')}</th>
                    <th className="px-4 py-3">{t('propertiesList.colMap')}</th>
                    <th className="px-4 py-3">{t('propertiesList.colCapacity')}</th>
                    <th className="px-4 py-3">{t('propertiesList.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {busy ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 w-full max-w-[8rem] animate-pulse rounded bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6">
                        <EmptyState
                          icon="🏢"
                          title={items.length === 0 ? t('propertiesList.emptyTitle') : t('propertiesList.emptyTitleFiltered')}
                          description={items.length === 0 ? t('propertiesList.emptyDesc') : t('propertiesList.emptyDescFiltered')}
                        />
                      </td>
                    </tr>
                  ) : (
                    filtered.map((p) => (
                      <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          <Link to={`/properties/${p.id}`} className="hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                            {p.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{typeLabel(p.type)}</td>
                        <td className="px-4 py-3">
                          {p.assigned_manager ? (
                            <ManagerBadge name={p.assigned_manager} variant="compact" />
                          ) : (
                            <span className="text-xs text-slate-400">{t('propertiesList.assignedManagerEmpty')}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{p.deed_number || '-'}</td>
                        <td className="px-4 py-3">
                          {p.maps_link ? (
                            <a href={p.maps_link} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:underline">
                              {t('propertiesList.openMap')}
                            </a>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{p.total_units_capacity}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link to={`/properties/${p.id}`}>
                              <Button variant="subtle" size="sm" type="button">
                                {t('propertiesList.editAction')}
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={deletingId === p.id}
                              disabled={deletingId !== null && deletingId !== p.id}
                              onClick={() => onSoftDelete(p.id)}
                            >
                              {t('propertiesList.hideAction')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
