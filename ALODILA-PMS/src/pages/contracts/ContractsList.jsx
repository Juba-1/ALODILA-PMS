import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AdvancedFilterBar } from '../../components/AdvancedFilterBar'
import { ExportButton } from '../../components/ExportButton'
import { TargetedPdfButton } from '../../components/TargetedPdfButton'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getActiveProperties } from '../../lib/db/properties'
import { getTenants } from '../../lib/db/tenants'
import { getActiveUnits } from '../../lib/db/units'
import { createContract, getContracts, softDeleteContract, updateContract } from '../../lib/db/contracts'
import { generateInstallmentsForContract } from '../../lib/db/contractFinance'
import { reportLoadFailure } from '../../lib/supabase/authErrors'
import { translateContractStatus, translateUtilityPayment } from '../../lib/i18n/domainLabels'
import ContractForm from './ContractForm'
import { EmptyState } from '../../components/ui/EmptyState'
import { exportReportPdf } from '../../lib/print/targetedPdf'

const CONTRACT_STATUSES = ['ساري', 'منتهي', 'ملغى', 'نزاع قانوني']

function badge(status) {
  if (status === 'ساري') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'ملغى') return 'bg-red-50 text-red-700 ring-red-200'
  if (status === 'نزاع قانوني') return 'bg-amber-50 text-amber-800 ring-amber-200'
  if (status === 'منتهي') return 'bg-slate-100 text-slate-700 ring-slate-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

export default function ContractsList() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const dir = lang === 'en' ? 'ltr' : 'rtl'
  const { push: toastPush } = useToastDispatch()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [q, setQ] = useState('')

  const [tenants, setTenants] = useState([])
  const [units, setUnits] = useState([])
  const [properties, setProperties] = useState([])
  const [refsBusy, setRefsBusy] = useState(true)

  const [filterPropertyId, setFilterPropertyId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [startFrom, setStartFrom] = useState('')
  const [startTo, setStartTo] = useState('')
  const [endFrom, setEndFrom] = useState('')
  const [endTo, setEndTo] = useState('')

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)

  async function refresh() {
    setBusy(true)
    try {
      const data = await getContracts()
      setItems(data)
    } catch (e) {
      reportLoadFailure(toastPush, e, t('contractsList.toastLoadFail'), true)
    } finally {
      setBusy(false)
    }
  }

  async function refreshRefs() {
    setRefsBusy(true)
    try {
      const [tn, u, p] = await Promise.all([getTenants(), getActiveUnits(), getActiveProperties()])
      setTenants(tn)
      setUnits(u)
      setProperties(p)
    } catch (e) {
      reportLoadFailure(toastPush, e, t('contractsList.toastRefFail'), true)
    } finally {
      setRefsBusy(false)
    }
  }

  useEffect(() => {
    refresh()
    refreshRefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((c) => {
      if (filterPropertyId && String(c.property_id || '') !== filterPropertyId) return false
      if (filterStatus && String(c.status || '') !== filterStatus) return false
      if (startFrom && String(c.start_date || '') < startFrom) return false
      if (startTo && String(c.start_date || '') > startTo) return false
      if (endFrom && String(c.end_date || '') < endFrom) return false
      if (endTo && String(c.end_date || '') > endTo) return false
      if (!needle) return true
      const hay = `${c.ejar_contract_number || ''} ${c.tenant_full_name || ''} ${c.unit_name || ''} ${c.property_name || ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [items, q, filterPropertyId, filterStatus, startFrom, startTo, endFrom, endTo])

  const exportRows = useMemo(() => {
    return filtered.map((c) => ({
      [t('contractsList.colEjar')]: c.ejar_contract_number || '',
      [t('common.property')]: c.property_name || '',
      [t('common.tenant')]: c.tenant_full_name || '',
      [t('common.unit')]: c.unit_name || '',
      [t('contractsList.colStart')]: c.start_date,
      [t('contractsList.colEnd')]: c.end_date,
      [t('contractsList.colContractValueShort')]: c.contract_value,
      [t('contractsList.colUtilityPayType')]: translateUtilityPayment(c.utility_payment_type || 'مستقل', lang),
      [t('contractsList.colUtilityFlat')]: c.utility_payment_type === 'مقطوع' ? c.utility_flat_amount_sar ?? '' : '',
      [t('contractsList.colHandoverNotes')]: c.handover_notes || '',
      [t('common.status')]: translateContractStatus(c.status, lang),
    }))
  }, [filtered, t, lang])

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(c) {
    setEditing({
      ...c,
      tenant_id: c?.tenant?.id || c.tenant_id,
      unit_id: c?.unit?.id || c.unit_id,
    })
    setOpen(true)
  }

  async function onSave(values) {
    if (!values.tenant_id || !values.unit_id || !values.start_date || !values.end_date) {
      toastPush({ type: 'error', title: t('contractsList.toastValidationTitle'), message: t('contractsList.toastValidationFields') })
      return
    }

    const contractValue = Number(values.contract_value)
    const deposit = Number(values.deposit ?? 0)
    if (!Number.isFinite(contractValue) || contractValue < 0 || !Number.isFinite(deposit) || deposit < 0) {
      toastPush({
        type: 'error',
        title: t('contractsList.toastValidationTitle'),
        message: t('contractsList.toastValidationNumbers'),
      })
      return
    }

    const uid = values.unit_id
    const excludeId = editing?.id
    const unitBlocked = items.some(
      (c) => c.status === 'ساري' && c.id !== excludeId && String(c.unit_id || c?.unit?.id || '') === String(uid),
    )
    if (values.status === 'ساري' && unitBlocked) {
      toastPush({
        type: 'error',
        title: t('contractsList.toastUnitClashTitle'),
        message: t('contractsList.toastUnitClashMsg'),
      })
      return
    }

    const schedulePrefs = values?._schedule || { auto: false, vat_applicable: false }

    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateContract(editing.id, values)
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
        toastPush({ type: 'success', title: t('contractsList.toastUpdatedTitle'), message: t('contractsList.toastUpdatedMsg') })
      } else {
        const created = await createContract(values)
        setItems((prev) => [created, ...prev])
        toastPush({ type: 'success', title: t('contractsList.toastCreatedTitle'), message: t('contractsList.toastCreatedMsg') })
        if (schedulePrefs.auto && created?.id) {
          try {
            const gen = await generateInstallmentsForContract(created, {
              vat_applicable: schedulePrefs.vat_applicable === true,
              replaceExisting: false,
            })
            if (gen.count > 0) {
              toastPush({
                type: 'success',
                title: t('contractsList.toastScheduleOk'),
                message: t('contractsList.toastScheduleOkMsg', { count: gen.count }),
              })
            }
          } catch (schedErr) {
            console.warn('[ContractsList] auto-schedule failed', schedErr)
            toastPush({
              type: 'error',
              title: t('contractsList.toastScheduleFailTitle'),
              message: schedErr?.message || t('contractsList.toastScheduleFailMsg'),
            })
          }
        }
      }
      setOpen(false)
      setEditing(null)
    } catch (e) {
      reportLoadFailure(toastPush, e, t('contractsList.toastSaveFail'), true)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id) {
    const ok = window.confirm(t('contractsList.confirmHide'))
    if (!ok) return
    try {
      await softDeleteContract(id)
      setItems((prev) => prev.filter((x) => x.id !== id))
      toastPush({ type: 'success', title: t('contractsList.toastHiddenTitle'), message: t('contractsList.toastHiddenMsg') })
    } catch (e) {
      reportLoadFailure(toastPush, e, t('contractsList.toastHideFailTitle'), true)
    }
  }

  return (
    <div className="max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>{t('contractsList.pageTitle')}</CardTitle>
              <CardDescription>{t('contractsList.pageDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={exportRows} filename={t('contractsList.exportFilename')} disabled={busy} />
              <ExportButton rows={exportRows} filename={t('contractsList.exportFilename')} format="csv" disabled={busy} />
              <TargetedPdfButton
                disabled={busy}
                onClick={() =>
                  exportReportPdf({
                    title: t('contractsList.pdfTitle'),
                    subtitle: t('contractsList.pdfSubtitle'),
                    filename: 'contracts',
                    metaLines: [
                      `${t('common.date')}: ${new Date().toISOString().slice(0, 10)}`,
                      `${t('contractsList.pdfRowsLabel')}: ${exportRows.length}`,
                    ],
                    rows: exportRows,
                    dir,
                  })
                }
              />
              <Button variant="gold" onClick={openCreate} disabled={refsBusy}>
                {t('contractsList.newContract')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>{t('common.search')}</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('contractsList.searchPlaceholder')} />
            </div>
            <div className="flex items-end">
              <div className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                {t('contractsList.totalLabel')}: <span className="font-bold text-slate-900">{filtered.length}</span>
              </div>
            </div>
          </div>

          <AdvancedFilterBar>
            <div>
              <Label>{t('common.property')}</Label>
              <Select value={filterPropertyId} onChange={(e) => setFilterPropertyId(e.target.value)}>
                <option value="">{t('reports.filterAllProperties')}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('common.status')}</Label>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">{t('contractsList.allStatuses')}</option>
                {CONTRACT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {translateContractStatus(s, lang)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('contractsList.colStartFrom')}</Label>
              <Input type="date" value={startFrom} onChange={(e) => setStartFrom(e.target.value)} />
            </div>
            <div>
              <Label>{t('contractsList.colStartTo')}</Label>
              <Input type="date" value={startTo} onChange={(e) => setStartTo(e.target.value)} />
            </div>
            <div>
              <Label>{t('contractsList.colEndFrom')}</Label>
              <Input type="date" value={endFrom} onChange={(e) => setEndFrom(e.target.value)} />
            </div>
            <div>
              <Label>{t('contractsList.colEndTo')}</Label>
              <Input type="date" value={endTo} onChange={(e) => setEndTo(e.target.value)} />
            </div>
          </AdvancedFilterBar>

          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-start text-xs font-bold text-slate-600">
                    <th className="px-4 py-3">{t('contractsList.colEjar')}</th>
                    <th className="px-4 py-3">{t('common.property')}</th>
                    <th className="px-4 py-3">{t('common.tenant')}</th>
                    <th className="px-4 py-3">{t('common.unit')}</th>
                    <th className="px-4 py-3">{t('contractsList.colStart')}</th>
                    <th className="px-4 py-3">{t('contractsList.colEnd')}</th>
                    <th className="px-4 py-3">{t('contractsList.colContractValue')}</th>
                    <th className="px-4 py-3">{t('contractsList.colServices')}</th>
                    <th className="px-4 py-3">{t('common.status')}</th>
                    <th className="px-4 py-3">{t('contractsList.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {busy ? (
                    Array.from({ length: 7 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Array.from({ length: 10 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 w-full max-w-[10rem] animate-pulse rounded bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-6">
                        <EmptyState
                          icon="📄"
                          title={items.length === 0 ? t('contractsList.emptyTitle') : t('contractsList.emptyTitleFiltered')}
                          description={items.length === 0 ? t('contractsList.emptyDesc') : t('contractsList.emptyDescFiltered')}
                        />
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-bold text-slate-900">{c.ejar_contract_number || '-'}</td>
                        <td className="px-4 py-3 text-slate-800">{c.property_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-800">{c.tenant_full_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-800">{c.unit_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{c.start_date}</td>
                        <td className="px-4 py-3 text-slate-700">{c.end_date}</td>
                        <td className="px-4 py-3 text-slate-700">{c.contract_value}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <span className="font-semibold">{translateUtilityPayment(c.utility_payment_type || 'مستقل', lang)}</span>
                          {c.utility_payment_type === 'مقطوع' && c.utility_flat_amount_sar != null ? (
                            <span className="ms-1 text-xs text-slate-500">
                              {' '}
                              (+{c.utility_flat_amount_sar} {t('common.currencySar')})
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${badge(c.status)}`}>
                            {translateContractStatus(c.status, lang)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link to={`/contracts/${c.id}`}>
                              <Button variant="gold" size="sm">
                                {t('contractsList.actionDetails')}
                              </Button>
                            </Link>
                            <Button variant="subtle" size="sm" onClick={() => openEdit(c)} disabled={refsBusy}>
                              {t('contractsList.actionEdit')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => onDelete(c.id)}>
                              {t('contractsList.actionHide')}
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

      <Modal open={open} onClose={() => (saving ? null : setOpen(false))} title={t('contractsList.modalTitle')}>
        <ContractForm
          key={editing?.id || 'create'}
          initialValue={editing}
          tenants={tenants}
          units={units}
          existingContracts={items}
          busy={saving}
          onSubmit={onSave}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </div>
  )
}
