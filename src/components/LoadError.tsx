import { errorMessage } from '../lib/errors'

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="form-note form-note-error" role="alert">
      <span>{errorMessage(error, 'No pudimos cargar los datos.')}</span>
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  )
}
