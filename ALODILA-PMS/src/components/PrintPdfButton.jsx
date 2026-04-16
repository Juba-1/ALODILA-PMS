import { Button } from './ui/Button'

export function PrintPdfButton({ label = 'طباعة PDF', disabled, className, size = 'sm' }) {
  return (
    <Button type="button" variant="subtle" size={size} className={className} disabled={disabled} onClick={() => window.print()}>
      {label}
    </Button>
  )
}
