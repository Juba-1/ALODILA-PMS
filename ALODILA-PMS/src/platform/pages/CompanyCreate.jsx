import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button.jsx'
import { useToastDispatch } from '../../components/toast/ToastProvider.jsx'
import { PlatformPageHeader } from '../components/PlatformPageHeader.jsx'
import { CompanyForm } from '../components/CompanyForm.jsx'
import { useCompanyCreate } from '../hooks/useCompanyCreate.js'
import { normalizeSlugInput } from '../lib/companyValidators.js'
import { errorMessageKey } from '../services/companiesErrors.js'

export default function CompanyCreate() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { push } = useToastDispatch()
  const { submit, submitting, error, fieldErrors } = useCompanyCreate()

  const [values, setValues] = useState({
    name: '',
    slug: '',
    notes: '',
    status: 'active',
    plan: 'trial',
    loginEmail: '',
    password: '',
    confirmPassword: '',
  })

  async function onSubmit(formValues) {
    try {
      const payload = {
        ...formValues,
        slug: normalizeSlugInput(formValues.slug),
      }
      const row = await submit(payload)
      push({ type: 'success', message: t('platform.toast.created') })
      navigate(`/platform/companies/${row.id}`)
    } catch (e) {
      if (e?.code !== 'VALIDATION') {
        push({
          type: 'error',
          message: e?.message || t(errorMessageKey(e?.code || 'UNKNOWN')),
        })
      }
    }
  }

  return (
    <div>
      <PlatformPageHeader
        title={t('platform.create.title')}
        subtitle={t('platform.create.subtitle')}
        actions={
          <Link to="/platform/companies">
            <Button variant="subtle">{t('platform.detail.back')}</Button>
          </Link>
        }
      />
      <CompanyForm
        mode="create"
        values={values}
        onChange={setValues}
        onSubmit={onSubmit}
        submitting={submitting}
        fieldErrors={fieldErrors}
        formError={error}
      />
    </div>
  )
}
