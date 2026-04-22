import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExportButton } from '../../components/ExportButton'
import { TargetedPdfButton } from '../../components/TargetedPdfButton'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { createOwner, getOwners, softDeleteOwner, updateOwner } from '../../lib/db/owners'
import { reportLoadFailure } from '../../lib/supabase/authErrors'
import { exportReportPdf } from '../../lib/print/targetedPdf'

export default function OwnersList() {
  const { t, i18n } = useTranslation()
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'
  const { push: toastPush } = useToastDispatch()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [phone, setPhone] = useState('')

  async function refresh() {
    setBusy(true)
    try {
      const data = await getOwners()
      setItems(data)
    } catch (e) {
      reportLoadFailure(toastPush, e, t('ownersList.toastLoadFail'), true)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return items
    return items.filter((o) => `${o.full_name} ${o.national_id} ${o.phone}`.toLowerCase().includes(n))
  }, [items, q])

  function openCreate() {
    setEditing(null)
    setFullName('')
    setNationalId('')
    setPhone('')
    setModalOpen(true)
  }

  function openEdit(o) {
    setEditing(o)
    setFullName(o.full_name || '')
    setNationalId(o.national_id || '')
    setPhone(o.phone || '')
    setModalOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    const fn = fullName.trim()
    const nid = nationalId.trim()
    const ph = phone.trim()
    if (!fn || !nid || !ph) {
      toastPush({ type: 'error', title: t('ownersList.toastValidationTitle'), message: t('ownersList.toastValidationFields') })
      return
    }
    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateOwner(editing.id, { full_name: fn, phone: ph })
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
        toastPush({ type: 'success', title: t('ownersList.toastUpdatedTitle'), message: t('ownersList.toastUpdatedMsg') })
      } else {
        const created = await createOwner({ full_name: fn, national_id: nid, phone: ph })
        setItems((prev) => [...prev, created].sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))))
        toastPush({ type: 'success', title: t('ownersList.toastCreatedTitle'), message: t('ownersList.toastCreatedMsg') })
      }
      setModalOpen(false)
      setEditing(null)
    } catch (err) {
      reportLoadFailure(toastPush, err, t('ownersList.toastSaveFail'), true)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id) {
    if (!window.confirm(t('ownersList.confirmHide'))) return
    try {
      await softDeleteOwner(id)
      setItems((prev) => prev.filter((x) => x.id !== id))
      toastPush({ type: 'success', title: t('ownersList.toastHiddenTitle'), message: t('ownersList.toastHiddenMsg') })
    } catch (err) {
      reportLoadFailure(toastPush, err, t('ownersList.toastHideFail'), true)
    }
  }

  const exportRows = useMemo(
    () => filtered.map((o) => ({
      [t('ownersList.colName')]: o.full_name,
      [t('ownersList.colId')]: o.national_id,
      [t('ownersList.colPhone')]: o.phone,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, i18n.language],
  )

  const modalTitle = editing ? t('ownersList.modalEditTitle') : t('ownersList.modalAddTitle')

  return (
    <div className="max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>{t('ownersList.pageTitle')}</CardTitle>
              <CardDescription>{t('ownersList.pageDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <ExportButton rows={exportRows} filename={t('ownersList.exportFilename')} disabled={busy} />
              <TargetedPdfButton
                disabled={busy}
                onClick={() =>
                  exportReportPdf({
                    title: t('ownersList.pdfTitle'),
                    subtitle: t('ownersList.pdfSubtitle'),
                    filename: 'owners',
                    metaLines: [
                      `${t('common.date')}: ${new Date().toISOString().slice(0, 10)}`,
                      `${t('contractsList.pdfRowsLabel')}: ${exportRows.length}`,
                    ],
                    rows: exportRows,
                    dir,
                  })
                }
              />
              <Button variant="gold" onClick={openCreate} disabled={busy}>
                {t('ownersList.newOwner')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label>{t('ownersList.searchLabel')}</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ownersList.searchPlaceholder')} />
          </div>
          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr className="text-start text-xs font-bold text-slate-600">
                  <th className="px-4 py-3">{t('ownersList.colName')}</th>
                  <th className="px-4 py-3">{t('ownersList.colId')}</th>
                  <th className="px-4 py-3">{t('ownersList.colPhone')}</th>
                  <th className="px-4 py-3">{t('ownersList.colActions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {busy ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      {t('ownersList.loadingRow')}
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      {t('ownersList.noResults')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((o) => (
                    <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-bold text-slate-900">{o.full_name}</td>
                      <td className="px-4 py-3 text-slate-700">{o.national_id}</td>
                      <td className="px-4 py-3 text-slate-700">{o.phone}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="subtle" size="sm" type="button" onClick={() => openEdit(o)}>
                            {t('ownersList.editAction')}
                          </Button>
                          <Button variant="ghost" size="sm" type="button" onClick={() => onDelete(o.id)}>
                            {t('ownersList.hideAction')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-slate-500">{t('ownersList.linkHint')}</p>
        </CardContent>
      </Card>

      <Modal open={modalOpen} onClose={() => (saving ? null : setModalOpen(false))} title={modalTitle}>
        <CardHeader>
          <CardTitle>{modalTitle}</CardTitle>
          <CardDescription>{t('ownersList.modalDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-3">
            <div>
              <Label>{t('ownersList.fieldFullName')}</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <Label>{t('ownersList.fieldNationalId')}</Label>
              <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} required readOnly={Boolean(editing)} />
            </div>
            <div>
              <Label>{t('ownersList.fieldPhone')}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            {editing ? <p className="text-xs text-slate-500">{t('ownersList.nationalIdLocked')}</p> : null}
            <div className="flex gap-2 pt-2">
              <Button variant="gold" type="submit" className="flex-1" disabled={saving}>
                {saving ? t('common.saving') : t('common.save')}
              </Button>
              <Button variant="subtle" type="button" className="flex-1" onClick={() => setModalOpen(false)} disabled={saving}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Modal>
    </div>
  )
}
