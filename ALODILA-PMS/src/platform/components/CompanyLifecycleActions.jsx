import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button.jsx'
import { useToastDispatch } from '../../components/toast/ToastProvider.jsx'
import { ConfirmCompanyActionModal } from './ConfirmCompanyActionModal.jsx'
import { useCompanyStatus } from '../hooks/useCompanyStatus.js'
import { useCompanySoftDelete } from '../hooks/useCompanySoftDelete.js'
import { isProtectedCompany } from '../lib/protectedCompanies.js'
import { suggestedLifecycleActions } from '../lib/companyTransitions.js'
import { errorMessageKey } from '../services/companiesErrors.js'

/**
 * Suspend / Activate / Soft-delete / Restore controls for a company.
 */
export function CompanyLifecycleActions({ company, onChanged }) {
  const { t } = useTranslation()
  const { push } = useToastDispatch()
  const protectedCompany = isProtectedCompany(company)
  const actions = suggestedLifecycleActions(company)

  const { changeStatus, submitting: statusBusy } = useCompanyStatus(company?.id)
  const { softDelete, restore, submitting: deleteBusy } = useCompanySoftDelete(company?.id)

  const [confirm, setConfirm] = useState(null)
  const busy = statusBusy || deleteBusy

  if (!company || protectedCompany) return null

  async function runConfirmed() {
    if (!confirm) return
    try {
      if (confirm === 'suspend') {
        await changeStatus('suspended')
        push({ type: 'success', message: t('platform.toast.suspended') })
      } else if (confirm === 'activate') {
        await changeStatus('active')
        push({ type: 'success', message: t('platform.toast.activated') })
      } else if (confirm === 'softDelete') {
        await softDelete()
        push({ type: 'success', message: t('platform.toast.deleted') })
      } else if (confirm === 'restore') {
        await restore()
        push({ type: 'success', message: t('platform.toast.restored') })
      }
      setConfirm(null)
      onChanged?.()
    } catch (e) {
      push({ type: 'error', message: t(errorMessageKey(e?.code || 'UNKNOWN')) })
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.canSuspend ? (
          <Button type="button" variant="subtle" disabled={busy} onClick={() => setConfirm('suspend')}>
            {t('platform.actions.suspend')}
          </Button>
        ) : null}
        {actions.canActivate ? (
          <Button type="button" variant="gold" disabled={busy} onClick={() => setConfirm('activate')}>
            {t('platform.actions.activate')}
          </Button>
        ) : null}
        {actions.canSoftDelete ? (
          <Button type="button" variant="danger" disabled={busy} onClick={() => setConfirm('softDelete')}>
            {t('platform.actions.softDelete')}
          </Button>
        ) : null}
        {actions.canRestore ? (
          <Button type="button" variant="gold" disabled={busy} onClick={() => setConfirm('restore')}>
            {t('platform.actions.restore')}
          </Button>
        ) : null}
      </div>

      <ConfirmCompanyActionModal
        open={Boolean(confirm)}
        actionType={confirm || 'softDelete'}
        company={company}
        busy={busy}
        onCancel={() => (busy ? null : setConfirm(null))}
        onConfirm={() => void runConfirmed()}
      />
    </>
  )
}
