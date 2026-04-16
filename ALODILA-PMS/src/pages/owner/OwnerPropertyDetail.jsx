import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getOwnerPropertyById, getOwnerPropertyUnits } from '../../lib/db/ownerPortal'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'

function typeLabel(t) {
  if (t === 'Residential') return 'سكني'
  if (t === 'Commercial') return 'تجاري'
  if (t === 'Mixed') return 'مختلط'
  return t || '—'
}

export default function OwnerPropertyDetail() {
  const { id } = useParams()
  const { ownerCrmId } = useOutletContext()
  const { push } = useToastDispatch()
  const [busy, setBusy] = useState(true)
  const [property, setProperty] = useState(null)
  const [units, setUnits] = useState([])

  const propertyId = id || ''
  const ownerKey = ownerCrmId || ''
  const toastPushRef = useRef(push)
  toastPushRef.current = push

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const [p, u] = await Promise.all([getOwnerPropertyById(ownerCrmId, id), getOwnerPropertyUnits(ownerCrmId, id)])
        if (cancelled) return
        setProperty(p)
        setUnits(u)
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure((p) => toastPushRef.current?.(p), e, 'تعذر التحميل', true)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [propertyId, ownerKey])

  if (!busy && !property) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-slate-600">
          العقار غير موجود أو غير مرتبط بحسابك.
          <div className="mt-4">
            <Link to="/owner/properties" className="font-bold text-slate-900 hover:underline">
              العودة لعقاراتي
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <Link to="/owner/properties" className="text-sm font-semibold text-slate-900 hover:underline">
          ← عقاراتي
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{busy ? '...' : property?.name}</CardTitle>
          <CardDescription>تفاصيل العقار والوحدات — عرض فقط</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {busy ? (
            <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-bold text-slate-500">التصنيف</div>
                  <div className="font-semibold text-slate-900">{property.category || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500">النوع</div>
                  <div className="font-semibold text-slate-900">{typeLabel(property.type)}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500">السعة</div>
                  <div className="font-semibold text-slate-900">{property.total_units_capacity ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500">تاريخ بداية الإدارة</div>
                  <div className="font-semibold text-slate-900">
                    {property.management_start_date ? String(property.management_start_date).slice(0, 10) : '—'}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs font-bold text-slate-500">رقم الصك</div>
                  <div className="font-semibold text-slate-900">{property.deed_number || '—'}</div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-extrabold text-slate-900">الوحدات</div>
                {units.length === 0 ? (
                  <div className="text-slate-500">لا وحدات مسجلة.</div>
                ) : (
                  <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                    <table className="min-w-full border-collapse text-right text-sm">
                      <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                        <tr>
                          <th className="border-b border-slate-200 px-3 py-2">الوحدة</th>
                          <th className="border-b border-slate-200 px-3 py-2">النوع</th>
                          <th className="border-b border-slate-200 px-3 py-2">الحالة</th>
                          <th className="border-b border-slate-200 px-3 py-2">الإيجار المستهدف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {units.map((u) => (
                          <tr key={u.id} className="odd:bg-white even:bg-slate-50/80">
                            <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-900">{u.unit_name}</td>
                            <td className="border-b border-slate-100 px-3 py-2">{typeLabel(u.type)}</td>
                            <td className="border-b border-slate-100 px-3 py-2">{u.status}</td>
                            <td className="border-b border-slate-100 px-3 py-2">{Number(u.target_rent_value || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
