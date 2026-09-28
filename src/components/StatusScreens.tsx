import { useAuth } from '../auth/context'
import { Brand } from './Brand'

export function LoadingScreen({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="center-screen" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p className="loading-inline" role="status">
      <span className="spinner spinner-sm" aria-hidden="true" />
      {label}
    </p>
  )
}

export function ConnectionErrorScreen() {
  const { refresh, signOut } = useAuth()
  return (
    <main className="auth-page">
      <div className="auth-card stack-md">
        <Brand />
        <h1 className="h-lg">No pudimos cargar tu cuenta</h1>
        <p className="text-muted">Revisá tu conexión a internet y probá de nuevo.</p>
        <div className="form-actions">
          <button type="button" className="btn btn-solid" onClick={() => void refresh()}>
            Reintentar
          </button>
          <button type="button" className="btn btn-outline" onClick={() => void signOut()}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </main>
  )
}
