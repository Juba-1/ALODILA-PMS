import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Label } from '../../components/ui/Input'
import { Combobox } from '../../components/ui/Combobox'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { mapMessyDataWithAI } from '../../lib/ai/aiMap'
import { getActiveProperties } from '../../lib/db/properties'
import { executeSmartImport } from '../../lib/db/smartImport'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'

function parseWorkbookRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result)
        const wb = XLSX.read(data, { type: 'array' })
        const out = []
        for (const name of wb.SheetNames) {
          const sheet = wb.Sheets[name]
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })
          ;(rows || []).forEach((row, idx) => {
            if (!row || typeof row !== 'object') return
            const hasSignal = Object.values(row).some((v) => String(v ?? '').trim().length > 0)
            if (!hasSignal) return
            out.push({ __sheet: name, __sheet_row: idx + 2, ...row })
          })
        }
        resolve(out)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'))
    reader.readAsArrayBuffer(file)
  })
}

export default function SmartImport() {
  const { push } = useToastDispatch()
  const toastPushRef = useRef(push)
  toastPushRef.current = push
  const [sourceRows, setSourceRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [mappedRows, setMappedRows] = useState([])
  const [failedAiRows, setFailedAiRows] = useState([])
  const [saveFailedRows, setSaveFailedRows] = useState([])
  const [saveSummary, setSaveSummary] = useState(null)
  const [properties, setProperties] = useState([])
  const [propertyId, setPropertyId] = useState('')
  const [busyParse, setBusyParse] = useState(false)
  const [busyAi, setBusyAi] = useState(false)
  const [busySave, setBusySave] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [aiProgress, setAiProgress] = useState({ processed: 0, total: 0, chunkSize: 0, done: false })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await getActiveProperties()
        if (!cancelled) setProperties(list || [])
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure((p) => toastPushRef.current?.(p), e, 'تعذر تحميل العقارات', true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const propertyOptions = useMemo(
    () => (properties || []).map((p) => ({ value: String(p.id), label: p.name || String(p.id) })),
    [properties],
  )

  const previewColumns = useMemo(() => {
    const skip = new Set(['_flagged', '_reason', '_skip', '__source_index'])
    const preferred = [
      '__sheet',
      '__sheet_row',
      'owner_name',
      'property_name',
      'unit_name',
      'tenant_full_name',
      'national_id_or_cr',
      'phone',
      'rent_value',
      'rooms_count',
      '_import_status',
      '_import_message',
    ]
    const keys = new Set()
    for (const row of mappedRows) {
      if (row && typeof row === 'object')
        Object.keys(row).forEach((k) => {
          if (!skip.has(k)) keys.add(k)
        })
    }
    const prefCols = preferred.filter((k) => keys.has(k))
    return prefCols.length ? prefCols : Array.from(keys)
  }, [mappedRows])

  const handleFile = useCallback(
    async (file) => {
      if (!file) return
      setBusyParse(true)
      setFileName(file.name)
      try {
        const rows = await parseWorkbookRows(file)
        setSourceRows(rows)
        setMappedRows([])
        setFailedAiRows([])
        setSaveFailedRows([])
        setSaveSummary(null)
        setAiProgress({ processed: 0, total: rows.length, chunkSize: 0, done: false })
        push({ type: 'success', title: 'تم تحميل الملف', message: `تمت قراءة ${rows.length} صف خام. جاهز للتحليل الذكي.` })
      } catch (e) {
        reportLoadFailure((p) => toastPushRef.current?.(p), e, 'فشل قراءة Excel', true)
      } finally {
        setBusyParse(false)
      }
    },
    [push],
  )

  const onAnalyze = async (rowsOverride = null) => {
    const rowsToAnalyze = Array.isArray(rowsOverride) ? rowsOverride : sourceRows
    if (!rowsToAnalyze.length) {
      push({ type: 'error', title: 'لا يوجد بيانات', message: 'ارفع ملف Excel أولاً.' })
      return
    }
    setBusyAi(true)
    try {
      setAiProgress({ processed: 0, total: rowsToAnalyze.length, chunkSize: 0, done: false })
      const result = await mapMessyDataWithAI({
        rows: rowsToAnalyze,
        onProgress: (p) => setAiProgress({ processed: p.processed || 0, total: p.total || rowsToAnalyze.length, chunkSize: p.chunkSize || 0, done: p.done === true }),
      })
      const okRows = Array.isArray(result?.rows) ? result.rows : []
      const badRows = Array.isArray(result?.failedRows) ? result.failedRows : []
      setMappedRows((prev) => {
        if (!rowsOverride) return okRows
        const touched = new Set([...okRows, ...badRows].map((r) => r.__source_index))
        return [...prev.filter((r) => !touched.has(r.__source_index)), ...okRows].sort(
          (a, b) => Number(a.__source_index || 0) - Number(b.__source_index || 0),
        )
      })
      setFailedAiRows(badRows)
      if (!okRows.length && !badRows.length) {
        push({ type: 'error', title: 'لا صفوف', message: 'لم يُرجع النموذج أي صفوف صالحة.' })
      } else {
        push({
          type: badRows.length ? 'info' : 'success',
          title: 'اكتمل التحليل',
          message: `نجح: ${okRows.length} — فشل: ${badRows.length}`,
        })
      }
    } catch (e) {
      reportLoadFailure((p) => toastPushRef.current?.(p), e, 'فشل التحليل', true)
    } finally {
      setBusyAi(false)
    }
  }

  const onSave = async (rowsOverride = null) => {
    const rowsToSave = Array.isArray(rowsOverride) ? rowsOverride : mappedRows
    if (!rowsToSave.length) {
      push({ type: 'error', title: 'لا بيانات للحفظ', message: 'نفّذ التحليل أولاً.' })
      return
    }
    setBusySave(true)
    try {
      const res = await executeSmartImport({ propertyId, rows: rowsToSave })
      setSaveSummary(res)
      setSaveFailedRows(res.failedRows || [])
      setMappedRows([...(res.successRows || []), ...(res.failedRows || [])].sort((a, b) => Number(a.__source_index || 0) - Number(b.__source_index || 0)))
      push({
        type: res.failedRows?.length ? 'info' : 'success',
        title: 'تم الحفظ',
        message:
          `عقارات جديدة: ${res.propertiesCreated} — وحدات جديدة: ${res.unitsInserted} — تحديث وحدات: ${res.unitsUpdated} — مستأجرون جدد: ${res.tenantsCreated}` +
          (res.failedRows?.length ? ` — فشل: ${res.failedRows.length}` : ''),
      })
    } catch (e) {
      reportLoadFailure((p) => toastPushRef.current?.(p), e, 'فشل الحفظ', true)
    } finally {
      setBusySave(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>الاستيراد الذكي (AI)</CardTitle>
          <CardDescription>
            رفع ملفات Excel قديمة غير منظمة، تحويلها عبر ALODILA AI (Groq) إلى مخطط موحّد، ثم إدراج الوحدات (وإنشاء المستأجرين عند
            اكتمال البيانات).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-sm font-bold text-slate-900">منطق المؤسسة (Enterprise)</div>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-600">
              <li>
                الملف يُجزّأ إلى دفعات صغيرة، ويُحلل ذكياً على مراحل مع إعادة المحاولة التلقائية عند ضغط Groq أو كِبر الحمولة.
              </li>
              <li>إذا وُجد اسم عقار داخل Excel فالنظام يستنتج الهيكل تلقائياً (مالك ← عقار ← وحدة ← مستأجر) ولا يطلب منك اختيار العقار.</li>
              <li>لا يتم منع الحفظ بسبب نقص بسيط: إذا وُجدت وحدة بلا مستأجر فستُحفظ الوحدة، وإذا نقصت هوية المستأجر فسيُنشأ معرّف تقني مؤقت مع تحذير.</li>
              <li>إعادة رفع نفس الملف لا يجب أن تُكرر الوحدات/العقارات؛ النظام يعتمد منطق upsert ومطابقة مرنة للأسماء.</li>
            </ul>
          </div>

          <div>
            <Label>رفع ملف Excel</Label>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  document.getElementById('smart-import-file')?.click()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files?.[0]
                if (f) void handleFile(f)
              }}
              className={[
                'mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
                dragOver ? 'border-amber-500 bg-amber-500/5' : 'border-slate-200 bg-white hover:bg-slate-50',
              ].join(' ')}
              onClick={() => document.getElementById('smart-import-file')?.click()}
            >
              <input
                id="smart-import-file"
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                  e.target.value = ''
                }}
              />
              <div className="text-sm font-bold text-slate-900">اسحب الملف هنا أو انقر للاختيار</div>
              <div className="mt-1 text-xs text-slate-500">{fileName || 'لم يُحدد ملف بعد'}</div>
              {busyParse ? <div className="mt-2 text-xs font-semibold text-slate-900">جاري القراءة...</div> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="gold" disabled={busyAi || busyParse} onClick={onAnalyze}>
              تحليل البيانات بالذكاء الاصطناعي
            </Button>
            {sourceRows.length ? (
              <span className="self-center text-xs text-slate-500">عدد الصفوف الخام: {sourceRows.length}</span>
            ) : null}
          </div>

          {busyAi ? (
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="text-sm font-bold text-slate-900">جاري التحليل الذكي...</div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{
                    width: `${aiProgress.total ? Math.max(6, (Math.min(aiProgress.total, aiProgress.processed) / aiProgress.total) * 100) : 10}%`,
                  }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-600">
                {aiProgress.processed} / {aiProgress.total} — حجم الدفعة الحالي: {aiProgress.chunkSize || '-'}
              </div>
            </div>
          ) : null}

          {mappedRows.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <Combobox
                    label="عقار احتياطي (اختياري)"
                    value={propertyId}
                    onChange={setPropertyId}
                    options={propertyOptions}
                    placeholder="يُستخدم فقط عندما لا يحمل الصف اسم عقار"
                  />
                </div>
                <Button type="button" variant="gold" disabled={busySave} onClick={onSave}>
                  حفظ في قاعدة البيانات
                </Button>
                {failedAiRows.length ? (
                  <Button
                    type="button"
                    variant="subtle"
                    disabled={busyAi}
                    onClick={() => onAnalyze(sourceRows.filter((r, idx) => failedAiRows.some((f) => Number(f.__source_index) === idx)))}
                  >
                    إعادة تحليل الصفوف الفاشلة
                  </Button>
                ) : null}
                {saveFailedRows.length ? (
                  <Button type="button" variant="subtle" disabled={busySave} onClick={() => onSave(saveFailedRows)}>
                    إعادة حفظ الصفوف الفاشلة
                  </Button>
                ) : null}
              </div>

              {saveSummary ? (
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-700 ring-1 ring-slate-200 sm:grid-cols-4">
                  <div>عقارات جديدة: <span className="font-extrabold text-slate-900">{saveSummary.propertiesCreated}</span></div>
                  <div>وحدات جديدة: <span className="font-extrabold text-slate-900">{saveSummary.unitsInserted}</span></div>
                  <div>تحديث وحدات: <span className="font-extrabold text-slate-900">{saveSummary.unitsUpdated}</span></div>
                  <div>مستأجرون جدد: <span className="font-extrabold text-slate-900">{saveSummary.tenantsCreated}</span></div>
                  <div>تحذيرات: <span className="font-extrabold text-amber-700">{saveSummary.warnings}</span></div>
                  <div>فشل الحفظ: <span className="font-extrabold text-red-700">{saveSummary.failedRows?.length || 0}</span></div>
                </div>
              ) : null}

              {failedAiRows.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  توجد {failedAiRows.length} صفوف فشل تحليلها بالذكاء الاصطناعي. يمكنك المتابعة بحفظ الصفوف السليمة ثم إعادة تحليل الفاشل.
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                <table className="min-w-full border-collapse text-right text-sm">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                    <tr>
                      {previewColumns.map((col) => (
                        <th key={col} className="whitespace-nowrap border-b border-slate-200 px-3 py-2">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.map((row, idx) => {
                      const flagged = row?._flagged === true
                      const reason = String(row?._reason || '').trim()
                      return (
                        <Fragment key={idx}>
                          <tr
                            className={[
                              flagged
                                ? 'border-l-4 border-amber-500 bg-amber-50/80 odd:bg-amber-50/80 even:bg-amber-50/60'
                                : 'odd:bg-white even:bg-slate-50/80',
                            ].join(' ')}
                            title={flagged && reason ? reason : undefined}
                          >
                            {previewColumns.map((col) => (
                              <td key={col} className="border-b border-slate-100 px-3 py-2 text-slate-800">
                                {row[col] == null ? '—' : String(row[col])}
                              </td>
                            ))}
                          </tr>
                          {flagged && reason ? (
                            <tr className="bg-amber-50/40">
                              <td
                                colSpan={Math.max(1, previewColumns.length)}
                                className="border-b border-amber-200/80 px-3 py-1.5 text-xs text-red-700"
                              >
                                {reason}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-slate-500">
                راجع الجدول قبل الحفظ. يمكنك تعديل البيانات في Excel وإعادة الرفع إذا لزم الأمر.
              </div>
            </div>
          ) : null}

          <div className="flex gap-3 text-sm">
            <Link to="/properties" className="font-semibold text-slate-900 underline-offset-2 hover:underline">
              العقارات
            </Link>
            <Link to="/units-inventory" className="font-semibold text-slate-900 underline-offset-2 hover:underline">
              قائمة الوحدات
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
