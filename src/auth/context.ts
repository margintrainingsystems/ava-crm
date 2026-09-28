import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Access } from '../lib/permissions'

export type Member = {
  userId: string
  email: string
  displayName: string
  isOwner: boolean
  roleId: string | null
  roleName: string | null
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out'; notice?: string }
  | { status: 'error'; session: Session }
  | { status: 'ready'; session: Session; member: Member; access: Access }

export type AuthContextValue = {
  state: AuthState
  signOut: (notice?: string) => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth tiene que usarse dentro de AuthProvider')
  return value
}

// Para las pantallas internas, que solo se muestran con la sesión lista.
export function useMember(): { member: Member; access: Access; session: Session } {
  const { state } = useAuth()
  if (state.status !== 'ready') throw new Error('useMember necesita una sesión activa')
  return { member: state.member, access: state.access, session: state.session }
}
