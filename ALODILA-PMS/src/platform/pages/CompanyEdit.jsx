import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { useToastDispatch } from '../../components/toast/ToastProvider.jsx'
import { PlatformPageHeader } from '../components/PlatformPageHeader.jsx'
import { CompanyForm } from '../components/CompanyForm.jsx'
import { ProtectedCompanyNotice } from '../components/ProtectedCompanyNotice.jsx'
import { useCompanyDetail } from '../hooks/useCompanyDetail.js'
import { useCompanyUpdate } from '../hooks/useCompanyUpdate.js'
import { isProtectedCompany, lockedFieldsFor } from '../lib/protectedCompanies.js'
import { normalizeSlugInput } from '../lib/companyValidators.js'
import { errorMessageKey } from '../services/companiesErrors.js'

export default function CompanyEdit() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { push } = useToastDispatch()
  const { company, loading, error: loadError, reload } = useCompanyDetail(id)
  const { submit, submitting, error, fieldErrors } = useCompanyUpdate(id)

  const [values, setValues] = useState({ name: '', slug: '', notes: '', plan: 'trial', status: 'active' })
  const protectedCompany = isProtectedCompany(company)
  const locks = lockedFieldsFor(company)

  useEffect(() => {
    if (!company) return
    setValues({
      name: company.name || '',
      slug: company.slug || '',
      notes: company.notes_body || '',
      plan: company.plan || 'trial',
      status: company.status || 'active',
    })
  }, [company])

  async function onSubmit(formValues) {
    try {
      const payload = {
        notes: formValues.notes,
        plan: formValues.plan,
        status: formValues.status,
      }
      if (!locks.name) payload.name = formValues.name
      if (!locks.slug) payload.slug = normalizeSlugInput(formValues.slug)

      await submit(payload)
      push({ type: 'success', message: t('platform.toast.updated') })
      navigate(`/platform/companies/${id}`)
    } catch (e) {
      if (e?.code !== 'VALIDATION') {
        push({ type: 'error', message: t(errorMessageKey(e?.code || 'UNKNOWN')) })
      }
    }
  }

  return (
    <div>
      <PlatformPageHeader
        title={t('platform.edit.title')}
        subtitle={company?.name || t('platform.edit.subtitle')}
        actions={
          <Link to={`/platform/companies/${id}`}>
            <Button variant="subtle">{t('platform.edit.cancel')}</Button>
          </Link>
        }
      />

      {loading ? <div className="text-sm text-slate-600">{t('platform.common.loading')}</div> : null}

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div>{t('platform.detail.loadError')}</div>
          <Button className="mt-3" variant="subtle" size="sm" onClick={() => void reload()}>
            {t('platform.common.retry')}
          </Button>
        </div>
      ) : null}

      {!loading && !company ? (
        <EmptyState icon="🔍" title={t('platform.detail.notFound')} />
      ) : null}

      {company ? (
        <div className="space-y-4">
          {protectedCompany ? <ProtectedCompanyNotice /> : null}
          <CompanyForm
            mode="edit"
            values={values}
            onChange={setValues}
            onSubmit={onSubmit}
            submitting={submitting}
            fieldErrors={fieldErrors}
            lockedFields={{ ...locks, status: protectedCompany }}
            formError={error}
          />
        </div>
      ) : null}
    </div>
  )
}
