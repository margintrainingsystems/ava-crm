import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'

type Props = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
  onClose: () => void
}

export function ConfirmDialog({ open, title, children, confirmLabel, danger = false, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={title} onClose={busy ? () => undefined : onClose}>
      <div className="stack-sm text-muted">{children}</div>
      <div className="form-actions modal-actions">
        <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button
          type="button"
          className={danger ? 'btn btn-danger' : 'btn btn-solid'}
          onClick={handleConfirm}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? 'Un momento…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
