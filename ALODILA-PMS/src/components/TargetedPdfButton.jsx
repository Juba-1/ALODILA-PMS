import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button'

export function TargetedPdfButton({ label, disabled, className, size = 'sm', onClick }) {
  const { t } = useTranslation()
  const text = label || t('common.exportPdf', 'Export PDF')
  return (
    <Button type="button" variant="subtle" size={size} className={className} disabled={disabled} onClick={onClick}>
      {text}
    </Button>
  )
}

