import { Button } from './ui/Button'

export function TargetedPdfButton({ label = 'PDF (مستند)', disabled, className, size = 'sm', onClick }) {
  return (
    <Button type="button" variant="subtle" size={size} className={className} disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  )
}

