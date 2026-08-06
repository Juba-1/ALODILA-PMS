import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button.jsx'
import { Input, Label, Textarea } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { COMPANY_STATUSES } from '../lib/constants.js'
import { COMPANY_PLANS } from '../lib/companyPlan.js'
import { normalizeSlugInput } from '../lib/companyValidators.js'
import { errorMessageKey } from '../services/companiesErrors.js'

/**
 * Shared create/edit form (controlled).
 */
export function CompanyForm({
  mode = 'create',
  values,
  onChange,
  onSubmit,
  submitting,
  fieldErrors = {},
  lockedFields = {},
  formError = null,
}) {
  const { t } = useTranslation()

  function setField(key, value) {
    onChange?.({ ...values, [key]: value })
  }

  function fieldMessage(code) {
    if (!code) return null
    return t(errorMessageKey(code))
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(values)
      }}
    >
      <div>
        <Label htmlFor="platform-company-name">{t('platform.form.name')}</Label>
        <Input
          id="platform-company-name"
          value={values.name ?? ''}
          disabled={Boolean(lockedFields.name) || submitting}
          onChange={(e) => setField('name', e.target.value)}
          autoComplete="organization"
        />
        {fieldErrors.name ? <p className="mt-1 text-xs font-semibold text-red-600">{fieldMessage(fieldErrors.name)}</p> : null}
      </div>

      <div>
        <Label htmlFor="platform-company-slug">{t('platform.form.slug')}</Label>
        <Input
          id="platform-company-slug"
          value={values.slug ?? ''}
          disabled={Boolean(lockedFields.slug) || submitting}
          onChange={(e) => setField('slug', e.target.value)}
          onBlur={() => {
            if (lockedFields.slug) return
            setField('slug', normalizeSlugInput(values.slug))
          }}
          className="font-mono text-sm"
        />
        <p className="mt-1 text-xs text-slate-500">{t('platform.form.slugHint')}</p>
        {fieldErrors.slug ? <p className="mt-1 text-xs font-semibold text-red-600">{fieldMessage(fieldErrors.slug)}</p> : null}
      </div>

      {mode === 'create' ? (
        <>
          <div>
            <Label htmlFor="platform-company-email">{t('platform.form.loginEmail')}</Label>
            <Input
              id="platform-company-email"
              type="email"
              value={values.loginEmail ?? ''}
              disabled={submitting}
              onChange={(e) => setField('loginEmail', e.target.value)}
              autoComplete="off"
            />
            {fieldErrors.loginEmail ? (
              <p className="mt-1 text-xs font-semibold text-red-600">{fieldMessage(fieldErrors.loginEmail)}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="platform-company-password">{t('platform.form.password')}</Label>
              <Input
                id="platform-company-password"
                type="password"
                value={values.password ?? ''}
                disabled={submitting}
                onChange={(e) => setField('password', e.target.value)}
                autoComplete="new-password"
              />
              {fieldErrors.password ? (
                <p className="mt-1 text-xs font-semibold text-red-600">{fieldMessage(fieldErrors.password)}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="platform-company-confirm">{t('platform.form.confirmPassword')}</Label>
              <Input
                id="platform-company-confirm"
                type="password"
                value={values.confirmPassword ?? ''}
                disabled={submitting}
                onChange={(e) => setField('confirmPassword', e.target.value)}
                autoComplete="new-password"
              />
              {fieldErrors.confirmPassword ? (
                <p className="mt-1 text-xs font-semibold text-red-600">{fieldMessage(fieldErrors.confirmPassword)}</p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="platform-company-plan">{t('platform.form.plan')}</Label>
          <Select
            id="platform-company-plan"
            value={values.plan || 'trial'}
            disabled={submitting}
            onChange={(e) => setField('plan', e.target.value)}
          >
            {COMPANY_PLANS.map((p) => (
              <option key={p} value={p}>
                {t(`platform.plan.${p}`)}
              </option>
            ))}
          </Select>
          {fieldErrors.plan ? (
            <p className="mt-1 text-xs font-semibold text-red-600">{fieldMessage(fieldErrors.plan)}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="platform-company-status">{t('platform.form.status')}</Label>
          <Select
            id="platform-company-status"
            value={values.status || 'active'}
            disabled={submitting || Boolean(lockedFields.status)}
            onChange={(e) => setField('status', e.target.value)}
          >
            {COMPANY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`platform.status.${s}`)}
              </option>
            ))}
          </Select>
          {fieldErrors.status ? (
            <p className="mt-1 text-xs font-semibold text-red-600">{fieldMessage(fieldErrors.status)}</p>
          ) : null}
        </div>
      </div>

      <div>
        <Label htmlFor="platform-company-notes">{t('platform.form.notes')}</Label>
        <Textarea
          id="platform-company-notes"
          value={values.notes ?? ''}
          disabled={submitting}
          onChange={(e) => setField('notes', e.target.value)}
        />
        {fieldErrors.notes ? (
          <p className="mt-1 text-xs font-semibold text-red-600">{fieldMessage(fieldErrors.notes)}</p>
        ) : null}
      </div>

      {formError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {formError.message || t(errorMessageKey(formError.code || 'UNKNOWN'))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" variant="gold" loading={submitting}>
          {mode === 'create' ? t('platform.form.submitCreate') : t('platform.form.submitSave')}
        </Button>
      </div>
    </form>
  )
}
