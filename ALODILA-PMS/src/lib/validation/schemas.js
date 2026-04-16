import { z } from 'zod'

/** KSA-style: 05xxxxxxxx, +9665xxxxxxxx, 9665xxxxxxxx, optional spaces/dashes */
export const saudiPhoneSchema = z
  .string()
  .trim()
  .min(8, 'رقم الجوال قصير جداً')
  .transform((s) => s.replace(/[\s-]/g, ''))
  .refine((s) => /^(\+966|00966|966|0)?5\d{8}$/.test(s), 'صيغة الجوال غير صالحة (مثال: 05xxxxxxxx أو +9665xxxxxxxx)')

/** National ID / CR: digits 10–15 or common mixed CR formats */
export const nationalIdOrCrSchema = z
  .string()
  .trim()
  .min(3, 'رقم الهوية / السجل مطلوب')
  .max(32, 'القيمة طويلة جداً')
  .refine((s) => /^[\dA-Za-z\u0600-\u06FF-]+$/.test(s), 'أحرف غير مسموحة في رقم الهوية / السجل')

export const tenantFormSchema = z.object({
  national_id_or_cr: nationalIdOrCrSchema,
  full_name: z.string().trim().min(2, 'الاسم مطلوب'),
  tenant_type: z.enum(['individual', 'company']),
  phone: saudiPhoneSchema,
  national_address: z.string().trim().max(500).optional(),
})

/** @param {{ issues?: Array<{ message?: string }> }} zodError */
export function zodFirstIssueMessage(zodError) {
  const m = zodError?.issues?.[0]?.message
  return typeof m === 'string' && m.length ? m : 'تحقق من المدخلات'
}

function parseIsoDate(s) {
  if (!s || typeof s !== 'string') return null
  const d = new Date(`${s}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const UTILITY_PAYMENT_TYPES = z.enum(['مستقل', 'مشترك', 'شامل', 'مقطوع'])

export const contractFormPayloadSchema = z
  .object({
    tenant_id: z.string().min(1, 'اختر المستأجر').regex(UUID, 'معرّف المستأجر غير صالح'),
    unit_id: z.string().min(1, 'اختر الوحدة').regex(UUID, 'معرّف الوحدة غير صالح'),
    ejar_contract_number: z.string().trim().max(120).optional().nullable(),
    start_date: z.string().min(1, 'تاريخ البداية مطلوب'),
    end_date: z.string().min(1, 'تاريخ النهاية مطلوب'),
    actual_handover_date: z.string().optional().nullable(),
    contract_value: z.union([z.string(), z.number()]),
    deposit: z.union([z.string(), z.number()]),
    billing_cycle: z.string().min(1),
    status: z.string().min(1),
    utility_payment_type: UTILITY_PAYMENT_TYPES,
    utility_flat_amount_sar: z.union([z.string(), z.number()]).optional().nullable(),
    handover_notes: z.string().max(8000).optional().nullable(),
  })
  .refine((data) => parseIsoDate(data.start_date) != null, { message: 'تاريخ البداية غير صالح', path: ['start_date'] })
  .refine((data) => parseIsoDate(data.end_date) != null, { message: 'تاريخ النهاية غير صالح', path: ['end_date'] })
  .refine(
    (data) => {
      const a = parseIsoDate(data.start_date)
      const b = parseIsoDate(data.end_date)
      return Boolean(a && b && b > a)
    },
    { message: 'تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية', path: ['end_date'] },
  )
  .superRefine((data, ctx) => {
    if (data.utility_payment_type !== 'مقطوع') return
    const n = Number(data.utility_flat_amount_sar)
    if (!Number.isFinite(n) || n <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'عند اختيار «مقطوع» يجب إدخال مبلغ ثابت أكبر من صفر.',
        path: ['utility_flat_amount_sar'],
      })
    }
  })
