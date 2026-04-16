import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { tenantFormSchema, zodFirstIssueMessage } from '../../lib/validation/schemas'

const TYPE_VALUES = ['individual', 'company']

export default function TenantForm({ initialValue, busy, onSubmit, onCancel }) {
  const { t } = useTranslation()
  const isEdit = Boolean(initialValue?.id)

  const [nationalIdOrCr, setNationalIdOrCr] = useState('')
  const [fullName, setFullName] = useState('')
  const [tenantType, setTenantType] = useState('individual')
  const [phone, setPhone] = useState('')
  const [nationalAddress, setNationalAddress] = useState('')
  const [formError, setFormError] = useState('')

  const typeOptions = useMemo(
    () =>
      TYPE_VALUES.map((v) => ({
        value: v,
        label: v === 'individual' ? t('tenantForm.typeIndividual') : t('tenantForm.typeCompany'),
      })),
    [t],
  )

  const title = useMemo(() => (isEdit ? t('tenantForm.titleEdit') : t('tenantForm.titleCreate')), [isEdit, t])

  useEffect(() => {
    setNationalIdOrCr(initialValue?.national_id_or_cr || '')
    setFullName(initialValue?.full_name || '')
    setTenantType(initialValue?.tenant_type || 'individual')
    setPhone(initialValue?.phone || '')
    setNationalAddress(initialValue?.national_address || '')
    setFormError('')
  }, [initialValue])

  return (
    <>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{t('tenantForm.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setFormError('')
            const parsed = tenantFormSchema.safeParse({
              national_id_or_cr: nationalIdOrCr,
              full_name: fullName,
              tenant_type: tenantType,
              phone,
              national_address: nationalAddress.trim() === '' ? undefined : nationalAddress,
            })
            if (!parsed.success) {
              setFormError(zodFirstIssueMessage(parsed.error))
              return
            }
            onSubmit?.({
              ...parsed.data,
              national_address: parsed.data.national_address ?? null,
            })
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {formError ? (
            <div className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {formError}
            </div>
          ) : null}

          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <Label>{t('tenantForm.nationalId')}</Label>
            <Input
              value={nationalIdOrCr}
              onChange={(e) => {
                setNationalIdOrCr(e.target.value)
                setFormError('')
              }}
              required
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <Label>{t('tenantForm.fullName')}</Label>
            <Input
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value)
                setFormError('')
              }}
              required
              className="mt-1"
            />
          </div>

          <div>
            <Label>{t('tenantForm.tenantType')}</Label>
            <Select value={tenantType} onChange={(e) => setTenantType(e.target.value)} required className="mt-1">
              {typeOptions.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>{t('tenantForm.phone')}</Label>
            <Input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setFormError('')
              }}
              required
              placeholder={t('tenantForm.phonePh')}
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2">
            <Label>{t('tenantForm.nationalAddress')}</Label>
            <Input
              value={nationalAddress}
              onChange={(e) => setNationalAddress(e.target.value)}
              placeholder={t('tenantForm.nationalAddressPh')}
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2 flex gap-3 border-t border-slate-200 pt-4">
            <Button variant="primary" className="flex-1" type="submit" loading={busy}>
              {t('tenantForm.save')}
            </Button>
            <Button variant="subtle" className="flex-1" type="button" onClick={onCancel} disabled={busy}>
              {t('tenantForm.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </>
  )
}
