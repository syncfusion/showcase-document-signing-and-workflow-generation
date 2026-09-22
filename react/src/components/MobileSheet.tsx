import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import './MobileSheet.css'

interface MobileSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function MobileSheet({ open, onClose, title, children }: MobileSheetProps) {
  if (!open) return null
  return (
    <>
      <div className="mobile-sheet__backdrop" onClick={onClose} />
      <div className="mobile-sheet__panel">
        <div className="mobile-sheet__head">
          <span>{title}</span>
          <button className="mobile-sheet__close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="mobile-sheet__body">{children}</div>
      </div>
    </>
  )
}
