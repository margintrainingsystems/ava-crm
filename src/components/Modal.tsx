import { useEffect, useId, useRef, type ReactNode } from 'react'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

// Ventana modal accesible con <dialog>: el navegador maneja el foco y la tecla Escape.
// Cerrada, no queda nada en la página.
export function Modal({ open, title, onClose, children, wide = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (open && dialog && !dialog.open) dialog.showModal()
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      className={wide ? 'modal modal-wide' : 'modal'}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="modal-body">
        <header className="modal-header">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
