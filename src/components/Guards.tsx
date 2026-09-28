import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { can, type PermissionKey } from '../lib/permissions'
import { ConnectionErrorScreen, LoadingScreen } from './StatusScreens'

// Pantallas internas: exige sesión activa de una persona del equipo.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <ConnectionErrorScreen />
  if (state.status === 'signed_out') {
    return <Navigate to="/ingresar" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

type AccessProps = { children: ReactNode } & ({ ownerOnly: true } | { permission: PermissionKey } | { anyOf: PermissionKey[] })

// Oculta una pantalla a quien no tiene permiso. La base de datos aplica la misma regla con RLS:
// esto solo evita mostrar una pantalla vacía.
export function RequireAccess(props: AccessProps) {
  const { state } = useAuth()
  if (state.status !== 'ready') return null
  const allowed =
    'ownerOnly' in props
      ? state.access.isOwner
      : 'anyOf' in props
        ? props.anyOf.some((p) => can(state.access, p))
        : can(state.access, props.permission)
  if (!allowed) return <NoPermission />
  return <>{props.children}</>
}

export function NoPermission() {
  return (
    <section className="stack-md">
      <h1 className="h-lg" tabIndex={-1} data-page-title>
        No tenés acceso a esta sección
      </h1>
      <p className="text-muted">Si la necesitás para tu trabajo, pedile a la propietaria que sume el permiso a tu rol.</p>
    </section>
  )
}
