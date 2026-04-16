import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getOwnerProperties } from '../../lib/db/ownerPortal'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'

function typeLabel(t) {
  if (t === 'Residential') return 'سكني'
  if (t === 'Commercial') return 'تجاري'
  if (t === 'Mixed') return 'مختلط'
  return t || '—'
}

export default function OwnerPropertiesList() {
  const { ownerCrmId } = useOutletContext()
  const { push } = useToastDispatch()
  const [busy, setBusy] = useState(true)
  const [rows, setRows] = useState([])

  const ownerKey = ownerCrmId || ''
  const toastPushRef = useRef(push)
  toastPushRef.current = push

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const list = await getOwnerProperties(ownerCrmId)
        if (!cancelled) setRows(list)
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure((p) => toastPushRef.current?.(p), e, 'تعذر تحميل العقارات', true)
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
        <CardTitle>عقاراتي</CardTitle>
        <CardDescription>العقارات المرتبطة بملف المالك في النظام — عرض فقط</CardDescription>
      </CardHeader>
      <CardContent>
        {busy ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-500">لا توجد عقارات مرتبطة بحسابك.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
            <table className="min-w-full border-collapse text-right text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2">الاسم</th>
                  <th className="border-b border-slate-200 px-3 py-2">التصنيف</th>
                  <th className="border-b border-slate-200 px-3 py-2">النوع</th>
                  <th className="border-b border-slate-200 px-3 py-2">السعة</th>
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
                        تفاصيل
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
