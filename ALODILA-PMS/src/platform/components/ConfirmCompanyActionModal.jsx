import { useTranslation } from 'react-i18next'
import { Modal } from '../../components/ui/Modal.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'

const ACTION_COPY = {
  suspend: { title: 'platform.confirm.suspendTitle', body: 'platform.confirm.suspendBody', confirm: 'platform.confirm.suspendConfirm', variant: 'primary' },
  activate: { title: 'platform.confirm.activateTitle', body: 'platform.confirm.activateBody', confirm: 'platform.confirm.activateConfirm', variant: 'gold' },
  softDelete: { title: 'platform.confirm.deleteTitle', body: 'platform.confirm.deleteBody', confirm: 'platform.confirm.deleteConfirm', variant: 'danger' },
  restore: { title: 'platform.confirm.restoreTitle', body: 'platform.confirm.restoreBody', confirm: 'platform.confirm.restoreConfirm', variant: 'gold' },
}

export function ConfirmCompanyActionModal({ open, actionType, company, onConfirm, onCancel, busy }) {
  const { t } = useTranslation()
  const copy = ACTION_COPY[actionType] || ACTION_COPY.softDelete

  return (
    <Modal open={open} onClose={busy ? undefined : onCancel} title={t(copy.title)}>
      <CardHeader>
        <CardTitle>{t(copy.title)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-700">{t(copy.body, { name: company?.name || '—' })}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="subtle" disabled={busy} onClick={onCancel}>
            {t('platform.confirm.cancel')}
          </Button>
          <Button type="button" variant={copy.variant} loading={busy} onClick={onConfirm}>
            {t(copy.confirm)}
          </Button>
        </div>
      </CardContent>
    </Modal>
  )
}
