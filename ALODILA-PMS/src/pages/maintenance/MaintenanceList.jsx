import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdvancedFilterBar } from '../../components/AdvancedFilterBar'
import { ExportButton } from '../../components/ExportButton'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Combobox } from '../../components/ui/Combobox'
import { Input, Label, Textarea } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getActiveProperties } from '../../lib/db/properties'
import { getActiveUnits } from '../../lib/db/units'
import {
  MAINTENANCE_STATUSES,
  createRequest,
  getRequests,
  maintenanceStatusBadgeClass,
  softDeleteRequest,
  updateRequest,
} from '../../lib/db/maintenance'
import { formatMoneyLocale } from '../../lib/format/moneyLocale'
import { translateMaintenanceStatus } from '../../lib/i18n/domainLabels'
import { reportLoadFailure } from '../../lib/supabase/authErrors'

export default function MaintenanceList() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const { push: toastPush } = useToastDispatch()
  const toastPushRef = useRef(toastPush)
  toastPushRef.current = toastPush
  const tRef = useRef(t)
  tRef.current = t

  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [q, setQ] = useState('')

  const [units, setUnits] = useState([])
  const [unitsBusy, setUnitsBusy] = useState(true)
  const [properties, setProperties] = useState([])
  const [propsBusy, setPropsBusy] = useState(true)

  const [filterPropertyId, setFilterPropertyId] = useState('')
  const [filterLifecycle, setFilterLifecycle] = useState('')
  const [costMin, setCostMin] = useState('')
  const [costMax, setCostMax] = useState('')

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)

  const [unitId, setUnitId] = useState('')
  const [description, setDescription] = useState('')
  const [cost, setCost] = useState('0')
  const [status, setStatus] = useState('مفتوح')

  async function refresh() {
    setBusy(true)
    try {
      const data = await getRequests()
      setItems(data)
    } catch (e) {
      reportLoadFailure(toastPushRef.current, e, tRef.current('maintenanceAdmin.toastLoadFail'), true)
    } finally {
      setBusy(false)
    }
  }

  async function refreshUnits() {
    setUnitsBusy(true)
    try {
      const data = await getActiveUnits()
      setUnits(data)
    } catch (e) {
      reportLoadFailure(toastPushRef.current, e, tRef.current('maintenanceAdmin.toastUnitsFail'), true)
    } finally {
      setUnitsBusy(false)
    }
  }

  async function refreshProperties() {
    setPropsBusy(true)
    try {
      const data = await getActiveProperties()
      setProperties(data)
    } catch (e) {
      reportLoadFailure(toastPushRef.current, e, tRef.current('maintenanceAdmin.toastPropsFail'), true)
    } finally {
      setPropsBusy(false)
    }
  }

  useEffect(() => {
    refresh()
    refreshUnits()
    refreshProperties()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unitOptions = useMemo(() => {
    return (units || []).map((u) => ({
      value: u.id,
      label: `${u.unit_name || t('common.unit')}${u.property_name ? ` — ${u.property_name}` : ''}`,
    }))
  }, [units, t])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((r) => {
      if (filterPropertyId && String(r.property_id || '') !== filterPropertyId) return false
      if (filterLifecycle === 'open' && !(r.status === 'مفتوح' || r.status === 'قيد المعالجة')) return false
      if (filterLifecycle === 'closed' && r.status !== 'مكتمل') return false
      const c = Number(r.cost_amount ?? 0)
      if (costMin !== '' && c < Number(costMin)) return false
      if (costMax !== '' && c > Number(costMax)) return false
      if (!needle) return true
      const hay = `${r.description || ''} ${r.property_name || ''} ${r.unit_name || ''} ${r.status || ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [items, q, filterPropertyId, filterLifecycle, costMin, costMax])

  const exportRows = useMemo(() => {
    return filtered.map((r) => ({
      [t('maintenanceAdmin.exportId')]: r.id,
      [t('common.property')]: r.property_name || '',
      [t('common.unit')]: r.unit_name || '',
      [t('common.description')]: r.description,
      [t('maintenanceAdmin.tableCost')]: Number(r.cost_amount ?? 0),
      [t('common.status')]: translateMaintenanceStatus(r.status, lang),
    }))
  }, [filtered, t, lang])

  function openCreate() {
    setEditing(null)
    setUnitId('')
    setDescription('')
    setCost('0')
    setStatus('مفتوح')
    setOpen(true)
  }

  function openEdit(r) {
    setEditing(r)
    setUnitId(String(r.unit_id || ''))
    setDescription(String(r.description || ''))
    setCost(r.cost_amount == null ? '0' : String(r.cost_amount))
    setStatus(String(r.status || 'مفتوح'))
    setOpen(true)
  }

  async function onSave() {
    const desc = String(description || '').trim()
    if (!unitId) {
      toastPush({ type: 'error', title: t('maintenanceAdmin.validationTitle'), message: t('maintenanceAdmin.toastPickUnit') })
      return
    }
    if (!desc) {
      toastPush({ type: 'error', title: t('maintenanceAdmin.validationTitle'), message: t('maintenanceAdmin.toastPickDesc') })
      return
    }

    const costNum = Number(cost)
    if (!Number.isFinite(costNum) || costNum < 0) {
      toastPush({ type: 'error', title: t('maintenanceAdmin.validationTitle'), message: t('maintenanceAdmin.toastCostInvalid') })
      return
    }

    if (!MAINTENANCE_STATUSES.includes(status)) {
      toastPush({ type: 'error', title: t('maintenanceAdmin.validationTitle'), message: t('maintenanceAdmin.toastInvalidStatus') })
      return
    }

    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateRequest(editing.id, {
          unit_id: unitId,
          description: desc,
          cost_amount: costNum,
          status,
        })
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
        toastPush({ type: 'success', title: t('maintenanceAdmin.toastUpdatedTitle'), message: t('maintenanceAdmin.toastUpdatedMsg') })
      } else {
        const created = await createRequest({
          unit_id: unitId,
          description: desc,
          cost_amount: costNum,
          status,
        })
        setItems((prev) => [created, ...prev])
        toastPush({ type: 'success', title: t('maintenanceAdmin.toastCreatedTitle'), message: t('maintenanceAdmin.toastCreatedMsg') })
      }
      setOpen(false)
    } catch (e) {
      reportLoadFailure(toastPush, e, t('maintenanceAdmin.toastSaveFail'), true)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id) {
    const ok = window.confirm(t('maintenanceAdmin.confirmHide'))
    if (!ok) return
    try {
      await softDeleteRequest(id)
      setItems((prev) => prev.filter((x) => x.id !== id))
      toastPush({ type: 'success', title: t('maintenanceAdmin.toastHiddenTitle'), message: t('maintenanceAdmin.toastHiddenMsg') })
    } catch (e) {
      reportLoadFailure(toastPush, e, t('maintenanceAdmin.toastHideFail'), true)
    }
  }

  return (
    <div className="max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>{t('maintenanceAdmin.title')}</CardTitle>
              <CardDescription>{t('maintenanceAdmin.desc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={exportRows} filename="maintenance-work-orders" label={t('maintenanceAdmin.export')} disabled={busy} />
              <Button variant="gold" onClick={openCreate} disabled={unitsBusy}>
                {t('maintenanceAdmin.newRequest')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>{t('maintenanceAdmin.searchLabel')}</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('maintenanceAdmin.searchPh')} />
            </div>
            <div className="flex items-end">
              <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {t('maintenanceAdmin.totalLabel')}: <span className="font-bold text-slate-800">{filtered.length}</span>
              </div>
            </div>
          </div>

          <AdvancedFilterBar>
            <div>
              <Label>{t('common.property')}</Label>
              <Select value={filterPropertyId} onChange={(e) => setFilterPropertyId(e.target.value)} disabled={propsBusy}>
                <option value="">{t('maintenanceAdmin.allProperties')}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('maintenanceAdmin.lifecycleFilter')}</Label>
              <Select value={filterLifecycle} onChange={(e) => setFilterLifecycle(e.target.value)}>
                <option value="">{t('maintenanceAdmin.lifecycleAll')}</option>
                <option value="open">{t('maintenanceAdmin.lifecycleOpen')}</option>
                <option value="closed">{t('maintenanceAdmin.lifecycleClosed')}</option>
              </Select>
            </div>
            <div>
              <Label>{t('maintenanceAdmin.costMin')}</Label>
              <Input value={costMin} onChange={(e) => setCostMin(e.target.value)} type="number" min={0} step="0.01" placeholder="0" />
            </div>
            <div>
              <Label>{t('maintenanceAdmin.costMax')}</Label>
              <Input value={costMax} onChange={(e) => setCostMax(e.target.value)} type="number" min={0} step="0.01" placeholder="999999" />
            </div>
          </AdvancedFilterBar>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-right text-xs font-bold text-slate-600">
                    <th className="px-4 py-3">{t('maintenanceAdmin.requestIdCol')}</th>
                    <th className="px-4 py-3">{t('common.property')}</th>
                    <th className="px-4 py-3">{t('common.unit')}</th>
                    <th className="px-4 py-3">{t('common.description')}</th>
                    <th className="px-4 py-3">{t('maintenanceAdmin.tableCost')}</th>
                    <th className="px-4 py-3">{t('common.status')}</th>
                    <th className="px-4 py-3">{t('maintenanceAdmin.tableActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {busy ? (
                    Array.from({ length: 7 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 w-full max-w-[12rem] animate-pulse rounded bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        {t('maintenanceAdmin.noRowsYet')}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-800">{r.id}</td>
                        <td className="px-4 py-3 text-slate-800">{r.property_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-800">{r.unit_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <div className="max-w-[28rem] whitespace-pre-wrap break-words">{r.description}</div>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800">{formatMoneyLocale(r.cost_amount, lang)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${maintenanceStatusBadgeClass(r.status)}`}
                          >
                            {translateMaintenanceStatus(r.status, lang)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button variant="subtle" size="sm" onClick={() => openEdit(r)} disabled={unitsBusy}>
                              {t('maintenanceAdmin.edit')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => onDelete(r.id)}>
                              {t('maintenanceAdmin.hide')}
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

      <Modal open={open} onClose={() => (saving ? null : setOpen(false))}>
        <>
          <CardHeader>
            <CardTitle>{editing?.id ? t('maintenanceAdmin.modalEditTitle') : t('maintenanceAdmin.modalCreateTitle')}</CardTitle>
            <CardDescription>{t('maintenanceAdmin.modalDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Combobox
                  label={t('maintenanceAdmin.unitLabel')}
                  value={unitId}
                  onChange={(v) => setUnitId(String(v || ''))}
                  options={unitOptions}
                  placeholder={t('maintenanceAdmin.unitSearchPh')}
                  required
                />
              </div>

              <div>
                <Label>{t('maintenanceAdmin.descLabelModal')}</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('maintenanceAdmin.descPhModal')} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>{t('maintenanceAdmin.costExpectedLabel')}</Label>
                  <Input value={cost} onChange={(e) => setCost(e.target.value)} type="number" min={0} step="0.01" />
                </div>
                <div>
                  <Label>{t('maintenanceAdmin.statusLabel')}</Label>
                  <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                    {MAINTENANCE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {translateMaintenanceStatus(s, lang)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex gap-3 border-t border-slate-200 pt-4">
                <Button variant="primary" className="flex-1" type="button" onClick={onSave} disabled={saving || unitsBusy}>
                  {saving ? t('contractsForm.saving') : t('maintenanceAdmin.save')}
                </Button>
                <Button variant="subtle" className="flex-1" type="button" onClick={() => setOpen(false)} disabled={saving}>
                  {t('maintenanceAdmin.cancel')}
                </Button>
              </div>
            </div>
          </CardContent>
        </>
      </Modal>
    </div>
  )
}
