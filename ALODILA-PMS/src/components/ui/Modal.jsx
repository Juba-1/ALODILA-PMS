import { useEffect } from 'react'
import { Card } from './Card'

export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px] transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-label={title || undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="w-full max-w-xl">
        <Card className="max-h-[min(90vh,44rem)] overflow-y-auto shadow-xl">{children}</Card>
      </div>
    </div>
  )
}
