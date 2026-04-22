import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ExportButton } from '../../components/ExportButton'
import { TargetedPdfButton } from '../../components/TargetedPdfButton'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { cn } from '../../components/ui/cn'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { paymentStatusOfInvoice, remainingOnInvoice, sumPaid } from '../../lib/finance/invoiceDerived'
import { classifyInstallment, compareIso, isSameMonth, todayIso } from '../../lib/finance/schedule'
import { centsToMoneyString, moneyToCents } from '../../lib/money/cents'
import { getActiveContractsForSelect } from '../../lib/db/contracts'
import { getActiveProperties } from '../../lib/db/properties'
import { createInvoice, getInvoices, softDeleteInvoice, updateInvoice } from '../../lib/db/invoices'
import InvoiceForm from './InvoiceForm'
import { reportLoadFailure } from '../../lib/supabase/authErrors'
import PaymentModal from './PaymentModal'
import { exportReportPdf } from '../../lib/print/targetedPdf'

const FILTER_CHIP_IDS = ['all', 'overdue', 'thisMonth', 'unpaid', 'paid']

const CHIP_TONES = {
  all: 'bg-slate-900 text-white',
  overdue: 'bg-red-600 text-white',
  thisMonth: 'bg-indigo-600 text-white',
  unpaid: 'bg-amber-500 text-slate-900',
  paid: 'bg-emerald-600 text-white',
}

function money(v) {
  return centsToMoneyString(moneyToCents(v))
}

function statusBadge(status) {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-800 ring-emerald-200'
  if (status === 'partial') return 'bg-amber-100 text-amber-900 ring-amber-200'
  if (status === 'overdue') return 'bg-red-100 text-red-800 ring-red-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

function StatusDot({ status, className = '' }) {
  const color =
    status === 'paid'
      ? 'bg-emerald-500'
      : status === 'partial'
        ? 'bg-amber-500'
        : status === 'overdue'
          ? 'bg-red-500'
          : 'bg-slate-400'
  return <span aria-hidden="true" className={cn('inline-block h-2 w-2 rounded-full', color, className)} />
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={cn('h-4 w-4 shrink-0 transition-transform', open ? 'rotate-180' : 'rotate-0')}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Build a per-contract rollup from the flat invoice list. The backend already
 * denormalizes tenant/unit/property into each invoice row, so we can bucket in
 * memory without extra fetches.
 */
function groupInvoicesByContract(invoices, { today, monthKey }) {
  const groups = new Map()
  for (const inv of invoices || []) {
    const key = inv.contract_id || inv.contract?.id || '__unlinked__'
    if (!groups.has(key)) {
      groups.set(key, {
        contract_id: key,
        tenant_full_name: inv.tenant_full_name || '',
        unit_name: inv.unit_name || '',
        property_id: inv.property_id || '',
        property_name: inv.property_name || '',
        ejar_contract_number: inv.ejar_contract_number || null,
        invoices: [],
      })
    }
    groups.get(key).invoices.push(inv)
  }

  const out = []
  for (const g of groups.values()) {
    const invs = g.invoices.slice().sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
    let totalCents = 0
    let paidCents = 0
    let overdueCount = 0
    let pendingCount = 0
    let paidCount = 0
    let partialCount = 0
    let thisMonthCount = 0
    let nextDue = null

    for (const inv of invs) {
      const tCents = moneyToCents(inv.total_amount)
      const pCents = (inv.payments || [])
        .filter((p) => p && p.is_deleted !== true)
        .reduce((s, p) => s + moneyToCents(p?.amount), 0)
      totalCents += tCents
      paidCents += pCents
      const cls = classifyInstallment({ ...inv, paid_amount: pCents / 100 }, today)
      inv._status = cls
      inv._paid = pCents / 100
      inv._remaining = Math.max(0, (tCents - pCents) / 100)
      if (cls === 'paid') paidCount += 1
      else if (cls === 'overdue') overdueCount += 1
      else if (cls === 'partial') partialCount += 1
      else pendingCount += 1
      if (String(inv.due_date || '').startsWith(monthKey)) thisMonthCount += 1
      if (cls !== 'paid' && !nextDue && compareIso(inv.due_date, today) >= 0) nextDue = inv.due_date
    }
    if (!nextDue) {
      const firstOpen = invs.find((x) => x._status !== 'paid')
      nextDue = firstOpen?.due_date || null
    }

    out.push({
      ...g,
      invoices: invs,
      summary: {
        invoiceCount: invs.length,
        totalValue: totalCents / 100,
        totalPaid: paidCents / 100,
        outstanding: Math.max(0, (totalCents - paidCents) / 100),
        paidCount,
        overdueCount,
        pendingCount,
        partialCount,
        thisMonthCount,
        nextDueDate: nextDue,
      },
    })
  }

  out.sort((a, b) => {
    const aOver = a.summary.overdueCount
    const bOver = b.summary.overdueCount
    if (aOver !== bOver) return bOver - aOver
    return String(a.summary.nextDueDate || '9999').localeCompare(String(b.summary.nextDueDate || '9999'))
  })
  return out
}

export default function InvoicesList() {
  const { t, i18n } = useTranslation()
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'
  const { push } = useToastDispatch()

  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [q, setQ] = useState('')

  const [contracts, setContracts] = useState([])
  const [properties, setProperties] = useState([])
  const [refsBusy, setRefsBusy] = useState(true)

  const [chip, setChip] = useState('all')
  const [filterPropertyId, setFilterPropertyId] = useState('')

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)

  const [payOpen, setPayOpen] = useState(false)
  const [payInvoice, setPayInvoice] = useState(null)

  const [expanded, setExpanded] = useState(() => new Set())

  const statusLabel = (status) => {
    if (status === 'paid') return t('invoicesList.statusPaid')
    if (status === 'partial') return t('invoicesList.statusPartial')
    if (status === 'overdue') return t('invoicesList.statusOverdue')
    return t('invoicesList.statusPending')
  }

  const chipLabel = (id) => {
    if (id === 'all') return t('invoicesList.filterAll')
    if (id === 'overdue') return t('invoicesList.filterOverdue')
    if (id === 'thisMonth') return t('invoicesList.filterDueThisMonth')
    if (id === 'paid') return t('invoicesList.filterPaid')
    return t('invoicesList.filterUnpaid')
  }

  async function refresh() {
    setBusy(true)
    try {
      const data = await getInvoices()
      setItems(data)
    } catch (e) {
      reportLoadFailure(push, e, t('invoicesList.toastLoadFail'), true)
    } finally {
      setBusy(false)
    }
  }

  async function refreshRefs() {
    setRefsBusy(true)
    try {
      const [c, p] = await Promise.all([getActiveContractsForSelect(), getActiveProperties()])
      setContracts(c)
      setProperties(p)
    } catch (e) {
      reportLoadFailure(push, e, t('invoicesList.toastContractLoadFail'), true)
    } finally {
      setRefsBusy(false)
    }
  }

  useEffect(() => {
    refresh()
    refreshRefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = useMemo(() => todayIso(), [])
  const monthKey = today.slice(0, 7)

  const grouped = useMemo(() => groupInvoicesByContract(items, { today, monthKey }), [items, today, monthKey])

  const filteredGroups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return grouped
      .map((g) => {
        const filteredInvs = g.invoices.filter((inv) => {
          if (filterPropertyId && String(inv.property_id || '') !== filterPropertyId) return false
          if (chip === 'overdue' && inv._status !== 'overdue') return false
          if (chip === 'paid' && inv._status !== 'paid') return false
          if (chip === 'unpaid' && inv._status === 'paid') return false
          if (chip === 'thisMonth' && !isSameMonth(inv.due_date, today)) return false
          return true
        })
        return { ...g, visibleInvoices: filteredInvs }
      })
      .filter((g) => {
        if (filterPropertyId && String(g.property_id || '') !== filterPropertyId) return false
        if (chip !== 'all' && g.visibleInvoices.length === 0) return false
        if (!needle) return true
        const hay = `${g.tenant_full_name} ${g.unit_name} ${g.property_name} ${g.ejar_contract_number || ''}`.toLowerCase()
        return hay.includes(needle)
      })
  }, [grouped, q, filterPropertyId, chip, today])

  const chipCounts = useMemo(() => {
    let overdue = 0
    let thisMonth = 0
    let unpaid = 0
    let paid = 0
    let all = 0
    for (const g of grouped) {
      for (const inv of g.invoices) {
        if (filterPropertyId && String(inv.property_id || '') !== filterPropertyId) continue
        all += 1
        if (inv._status === 'overdue') overdue += 1
        if (isSameMonth(inv.due_date, today)) thisMonth += 1
        if (inv._status === 'paid') paid += 1
        else unpaid += 1
      }
    }
    return { all, overdue, thisMonth, unpaid, paid }
  }, [grouped, filterPropertyId, today])

  const exportRows = useMemo(() => {
    const rows = []
    for (const g of filteredGroups) {
      for (const inv of g.visibleInvoices) {
        rows.push({
          [t('common.property')]: g.property_name || '',
          [t('common.tenant')]: g.tenant_full_name || '',
          [t('common.unit')]: g.unit_name || '',
          [t('invoicesList.colInvoiceNumber')]: inv.id,
          [t('invoicesList.colDueDate')]: inv.due_date,
          [t('invoicesList.colTotal')]: inv.total_amount,
          [t('invoicesList.colPaid')]: inv._paid,
          [t('invoicesList.colRemaining')]: inv._remaining,
          [t('common.status')]: statusLabel(inv._status),
        })
      }
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredGroups, i18n.language])

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function expandAll() {
    setExpanded(new Set(filteredGroups.map((g) => g.contract_id)))
  }
  function collapseAll() {
    setExpanded(new Set())
  }

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }
  function openEdit(inv) {
    setEditing(inv)
    setOpen(true)
  }

  async function onSave(values) {
    if (!values.contract_id || !values.due_date) {
      push({ type: 'error', title: t('invoicesList.toastValidationTitle'), message: t('invoicesList.toastValidationFields') })
      return
    }
    const sub = Number(values.subtotal_amount)
    const total = Number(values.total_amount)
    if (!Number.isFinite(sub) || sub < 0 || !Number.isFinite(total) || total < 0) {
      push({ type: 'error', title: t('invoicesList.toastValidationTitle'), message: t('invoicesList.toastValidationNumbers') })
      return
    }

    const payload = {
      contract_id: values.contract_id,
      due_date: values.due_date,
      subtotal_amount: Math.round(sub * 100) / 100,
      vat_applicable: Boolean(values.vat_applicable),
      total_amount: Math.round(total * 100) / 100,
    }

    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateInvoice(editing.id, payload)
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
        push({ type: 'success', title: t('invoicesList.toastUpdatedTitle'), message: t('invoicesList.toastUpdatedMsg') })
      } else {
        const created = await createInvoice(payload)
        setItems((prev) => [created, ...prev])
        push({ type: 'success', title: t('invoicesList.toastCreatedTitle'), message: t('invoicesList.toastCreatedMsg') })
      }
      setOpen(false)
    } catch (e) {
      reportLoadFailure(push, e, t('invoicesList.toastSaveFail'), true)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id) {
    const ok = window.confirm(t('invoicesList.confirmHide'))
    if (!ok) return
    try {
      await softDeleteInvoice(id)
      setItems((prev) => prev.filter((x) => x.id !== id))
      push({ type: 'success', title: t('invoicesList.toastHiddenTitle'), message: t('invoicesList.toastHiddenMsg') })
    } catch (e) {
      reportLoadFailure(push, e, t('invoicesList.toastHideFail'), true)
    }
  }

  function openPayment(inv) {
    setPayInvoice(inv)
    setPayOpen(true)
  }

  const totals = useMemo(() => {
    let totalCents = 0
    let paidCents = 0
    let overdueCents = 0
    for (const g of filteredGroups) {
      for (const inv of g.visibleInvoices) {
        totalCents += moneyToCents(inv.total_amount)
        paidCents += moneyToCents(inv._paid)
        if (inv._status === 'overdue') overdueCents += moneyToCents(inv._remaining)
      }
    }
    return {
      totalValue: totalCents / 100,
      totalPaid: paidCents / 100,
      outstanding: Math.max(0, (totalCents - paidCents) / 100),
      overdueAmount: overdueCents / 100,
    }
  }, [filteredGroups])

  return (
    <div className="max-w-7xl space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>{t('invoicesList.pageTitle')}</CardTitle>
              <CardDescription>{t('invoicesList.pageDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={exportRows} filename={t('invoicesList.exportFilename')} disabled={busy} />
              <TargetedPdfButton
                disabled={busy}
                onClick={() =>
                  exportReportPdf({
                    title: t('invoicesList.pdfTitle'),
                    subtitle: t('invoicesList.pdfSubtitle'),
                    filename: 'invoices',
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
                {t('invoicesList.newInvoice')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="text-[11px] font-bold text-slate-500">{t('invoicesList.totalValueShown')}</div>
              <div className="mt-1 text-lg font-extrabold text-slate-900">{money(totals.totalValue)}</div>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
              <div className="text-[11px] font-bold text-emerald-700">{t('invoicesList.totalCollected')}</div>
              <div className="mt-1 text-lg font-extrabold text-emerald-900">{money(totals.totalPaid)}</div>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <div className="text-[11px] font-bold text-amber-800">{t('invoicesList.totalOutstanding')}</div>
              <div className="mt-1 text-lg font-extrabold text-amber-950">{money(totals.outstanding)}</div>
            </div>
            <div className="rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
              <div className="text-[11px] font-bold text-red-800">{t('invoicesList.overdueAmount')}</div>
              <div className="mt-1 text-lg font-extrabold text-red-900">{money(totals.overdueAmount)}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 flex-1">
              <Label>{t('common.search')}</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('invoicesList.searchPlaceholder')} />
            </div>
            <div className="md:w-64">
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
          </div>

          <div className="-mx-1 flex flex-wrap items-center gap-2 overflow-x-auto px-1 pb-1">
            {FILTER_CHIP_IDS.map((id) => {
              const active = chip === id
              const count =
                id === 'all'
                  ? chipCounts.all
                  : id === 'overdue'
                    ? chipCounts.overdue
                    : id === 'thisMonth'
                      ? chipCounts.thisMonth
                      : id === 'paid'
                        ? chipCounts.paid
                        : chipCounts.unpaid
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setChip(id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition',
                    active ? `${CHIP_TONES[id]} ring-transparent shadow` : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  <span>{chipLabel(id)}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-extrabold', active ? 'bg-white/20' : 'bg-slate-100 text-slate-700')}>
                    {count}
                  </span>
                </button>
              )
            })}
            <div className="ms-auto flex items-center gap-2 text-xs">
              <button type="button" onClick={expandAll} className="rounded-full bg-slate-900 px-3 py-1.5 font-bold text-white hover:bg-slate-800">
                {t('invoicesList.expandAll')}
              </button>
              <button type="button" onClick={collapseAll} className="rounded-full bg-slate-100 px-3 py-1.5 font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">
                {t('invoicesList.collapseAll')}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {busy ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))
            ) : filteredGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                {t('invoicesList.noResults')}
              </div>
            ) : (
              filteredGroups.map((g) => {
                const isOpen = expanded.has(g.contract_id)
                const shown = g.visibleInvoices
                const s = g.summary
                const headerTone =
                  s.overdueCount > 0
                    ? 'border-red-200 bg-gradient-to-r from-red-50 to-white'
                    : s.outstanding > 0
                      ? 'border-amber-200 bg-gradient-to-r from-amber-50 to-white'
                      : 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-white'
                return (
                  <div key={g.contract_id} className={cn('overflow-hidden rounded-2xl border shadow-sm', headerTone)}>
                    <button
                      type="button"
                      onClick={() => toggle(g.contract_id)}
                      className="flex w-full flex-col gap-3 p-4 text-start md:flex-row md:items-center md:justify-between"
                      aria-expanded={isOpen}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <ChevronIcon open={isOpen} />
                          <span className="text-sm font-extrabold text-slate-900">
                            {g.tenant_full_name || t('invoicesList.unlinkedContract')}
                          </span>
                          {g.ejar_contract_number ? (
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-slate-700 ring-1 ring-slate-200">
                              {g.ejar_contract_number}
                            </span>
                          ) : null}
                          {s.overdueCount > 0 ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-extrabold text-red-800 ring-1 ring-red-200">
                              {t('invoicesList.overdueCountBadge', { count: s.overdueCount })}
                            </span>
                          ) : null}
                          {s.thisMonthCount > 0 ? (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-extrabold text-indigo-800 ring-1 ring-indigo-200">
                              {t('invoicesList.thisMonthCountBadge', { count: s.thisMonthCount })}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {g.unit_name || '—'} · {g.property_name || '—'}
                          {s.nextDueDate ? (
                            <>
                              {' '}
                              · <span className="font-bold text-slate-700">{t('invoicesList.nextDue')}: {s.nextDueDate}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="grid shrink-0 grid-cols-4 gap-2 text-center md:gap-3">
                        <div className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-slate-200">
                          <div className="text-[10px] font-bold text-slate-500">{t('invoicesList.installments')}</div>
                          <div className="text-sm font-extrabold text-slate-900">{s.invoiceCount}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-slate-200">
                          <div className="text-[10px] font-bold text-slate-500">{t('invoicesList.colTotal')}</div>
                          <div className="text-sm font-extrabold text-slate-900">{money(s.totalValue)}</div>
                        </div>
                        <div className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-emerald-200">
                          <div className="text-[10px] font-bold text-emerald-700">{t('invoicesList.colPaid')}</div>
                          <div className="text-sm font-extrabold text-emerald-900">{money(s.totalPaid)}</div>
                        </div>
                        <div className={cn('rounded-xl bg-white/80 px-3 py-2 ring-1', s.outstanding > 0 ? 'ring-amber-200' : 'ring-slate-200')}>
                          <div className="text-[10px] font-bold text-amber-800">{t('invoicesList.colRemaining')}</div>
                          <div className={cn('text-sm font-extrabold', s.outstanding > 0 ? 'text-amber-950' : 'text-slate-900')}>{money(s.outstanding)}</div>
                        </div>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-slate-200/70 bg-white">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-3">
                          <div className="text-xs text-slate-600">
                            {t('invoicesList.visibleInstallments')}: <span className="font-bold text-slate-900">{shown.length}</span>
                            {shown.length !== s.invoiceCount ? <span className="text-slate-500"> / {s.invoiceCount}</span> : null}
                          </div>
                          {g.contract_id && g.contract_id !== '__unlinked__' ? (
                            <Link to={`/contracts/${g.contract_id}`}>
                              <Button variant="subtle" size="sm">
                                {t('invoicesList.openContract')}
                              </Button>
                            </Link>
                          ) : null}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[720px] border-collapse text-sm">
                            <thead className="bg-slate-50">
                              <tr className="text-start text-xs font-bold text-slate-600">
                                <th className="px-4 py-3">{t('invoicesList.colStatus')}</th>
                                <th className="px-4 py-3">{t('invoicesList.colInvoiceNumber')}</th>
                                <th className="px-4 py-3">{t('invoicesList.colDue')}</th>
                                <th className="px-4 py-3">{t('invoicesList.colTotal')}</th>
                                <th className="px-4 py-3">{t('invoicesList.colPaid')}</th>
                                <th className="px-4 py-3">{t('invoicesList.colRemaining')}</th>
                                <th className="px-4 py-3">{t('invoicesList.colActions')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {shown.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                                    {t('invoicesList.noInsideResults')}
                                  </td>
                                </tr>
                              ) : (
                                shown.map((inv) => {
                                  const st = inv._status
                                  return (
                                    <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                                      <td className="px-4 py-3">
                                        <span className={cn('inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1', statusBadge(st))}>
                                          <StatusDot status={st} /> {statusLabel(st)}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 font-mono text-[12px] text-slate-700">
                                        <Link to={`/invoices/${inv.id}`} className="hover:underline">
                                          {String(inv.id).slice(0, 8).toUpperCase()}
                                        </Link>
                                      </td>
                                      <td className="px-4 py-3 text-slate-700">{inv.due_date}</td>
                                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{money(inv.total_amount)}</td>
                                      <td className="px-4 py-3 font-mono text-emerald-700">{money(inv._paid)}</td>
                                      <td className={cn('px-4 py-3 font-mono', inv._remaining > 0 ? 'text-amber-700' : 'text-slate-500')}>
                                        {money(inv._remaining)}
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-2">
                                          <Link to={`/invoices/${inv.id}`}>
                                            <Button variant="subtle" size="sm" type="button">
                                              {t('invoicesList.viewInvoice')}
                                            </Button>
                                          </Link>
                                          <Button variant="gold" size="sm" onClick={() => openPayment(inv)} disabled={st === 'paid'}>
                                            {st === 'paid' ? t('invoicesList.settled') : t('invoicesList.recordPaymentAction')}
                                          </Button>
                                          <Button variant="subtle" size="sm" onClick={() => openEdit(inv)}>
                                            {t('invoicesList.editInvoice')}
                                          </Button>
                                          <Button variant="ghost" size="sm" onClick={() => onDelete(inv.id)}>
                                            {t('invoicesList.hideInvoice')}
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => (saving ? null : setOpen(false))}>
        <InvoiceForm initialValue={editing} contracts={contracts} busy={saving} onSubmit={onSave} onCancel={() => setOpen(false)} />
      </Modal>

      <PaymentModal open={payOpen} invoice={payInvoice} onClose={() => setPayOpen(false)} onSaved={() => refresh()} />
    </div>
  )
}

export { paymentStatusOfInvoice, remainingOnInvoice, sumPaid }
