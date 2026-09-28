import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { AuthContext, type AuthState, type Member } from '../auth/context'
import { ToastProvider } from '../components/Toast'

export const fakeSession = { user: { id: 'u1' }, access_token: 't' } as unknown as Session

export function readyState(member: Partial<Member> = {}, permissions: string[] = [], isOwner = false): AuthState {
  return {
    status: 'ready',
    session: fakeSession,
    member: {
      userId: 'u1',
      email: 'ana@example.com',
      displayName: 'Ana Pérez',
      isOwner,
      roleId: isOwner ? null : 'r1',
      roleName: isOwner ? null : 'Docente',
      ...member,
    },
    access: { isOwner, permissions: new Set(permissions) },
  }
}

export function renderWithAuth(ui: ReactElement, state: AuthState, route = '/') {
  const value = { state, signOut: async () => undefined, refresh: async () => undefined }
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  )
}
