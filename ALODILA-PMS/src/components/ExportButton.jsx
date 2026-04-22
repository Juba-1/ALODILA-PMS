import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button'
import { exportRowsToExcel } from '../lib/export/toExcel'
import { exportRowsToCsv } from '../lib/export/toCsv'

/**
 * @param {'xlsx' | 'csv'} [format]
 */
export function ExportButton({ rows, filename, label, disabled, className, size = 'sm', format = 'xlsx' }) {
  const { t } = useTranslation()
  const defaultLabel = format === 'csv' ? `${t('common.export')} CSV` : t('common.export')
  return (
    <Button
      type="button"
      variant="subtle"
      size={size}
      className={className}
      disabled={disabled}
      onClick={() => (format === 'csv' ? exportRowsToCsv(rows, filename) : exportRowsToExcel(rows, filename))}
    >
      {label ?? defaultLabel}
    </Button>
  )
}
