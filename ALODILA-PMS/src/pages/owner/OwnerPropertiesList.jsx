import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getOwnerProperties } from '../../lib/db/ownerPortal'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'

export default function OwnerPropertiesList() {
  const { t } = useTranslation()
  const { ownerCrmId } = useOutletContext()
  const { push } = useToastDispatch()
  const [busy, setBusy] = useState(true)
  const [rows, setRows] = useState([])

  const ownerKey = ownerCrmId || ''
  const toastPushRef = useRef(push)
  toastPushRef.current = push
  const tRef = useRef(t)
  tRef.current = t

  const typeLabel = (raw) => {
    if (raw === 'Residential') return t('owner.typeResidential')
    if (raw === 'Commercial') return t('owner.typeCommercial')
    if (raw === 'Mixed') return t('owner.typeMixed')
    return raw || '—'
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const list = await getOwnerProperties(ownerCrmId)
        if (!cancelled) setRows(list)
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure((p) => toastPushRef.current?.(p), e, tRef.current('owner.propertiesLoadFail'), true)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ownerKey])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('owner.propertiesTitle')}</CardTitle>
        <CardDescription>{t('owner.propertiesDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {busy ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-500">{t('owner.propertiesEmpty')}</div>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
            <table className="min-w-full border-collapse text-start text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2">{t('owner.propertiesColName')}</th>
                  <th className="border-b border-slate-200 px-3 py-2">{t('owner.propertiesColCategory')}</th>
                  <th className="border-b border-slate-200 px-3 py-2">{t('owner.propertiesColType')}</th>
                  <th className="border-b border-slate-200 px-3 py-2">{t('owner.propertiesColCapacity')}</th>
                  <th className="border-b border-slate-200 px-3 py-2"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="odd:bg-white even:bg-slate-50/80">
                    <td className="border-b border-slate-100 px-3 py-2 font-bold text-slate-900">{p.name}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{p.category || '—'}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{typeLabel(p.type)}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{p.total_units_capacity ?? '—'}</td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <Link to={`/owner/properties/${p.id}`} className="font-semibold text-slate-900 hover:underline">
                        {t('owner.propertiesColDetails')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
