import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button'

export function PrintPdfButton({ label, disabled, className, size = 'sm' }) {
  const { t } = useTranslation()
  const finalLabel = label ?? t('common.printPdf')
  return (
    <Button type="button" variant="subtle" size={size} className={className} disabled={disabled} onClick={() => window.print()}>
      {finalLabel}
    </Button>
  )
}
