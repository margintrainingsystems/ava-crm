import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { clearStoredSession, supabase } from '../lib/supabase'
import { PERMISSION_KEYS, type Access } from '../lib/permissions'
import { AuthContext, type AuthState, type Member } from './context'

const NO_ACCESS_NOTICE = 'Tu cuenta no tiene acceso al CRM. Si creés que es un error, escribile a la propietaria.'

export async function loadMember(userId: string): Promise<{ member: Member; access: Access } | null> {
  const { data, error } = await supabase
    .from('crm_members')
    .select('user_id, email, display_name, is_owner, active, role_id, role:crm_roles(name)')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data || !data.active) return null

  const member: Member = {
    userId: data.user_id,
    email: data.email,
    displayName: data.display_name,
    isOwner: data.is_owner,
    roleId: data.role_id,
    roleName: data.role?.name ?? null,
  }

  if (member.isOwner) {
    return { member, access: { isOwner: true, permissions: new Set(PERMISSION_KEYS) } }
  }

  const perms = await supabase.from('crm_role_permissions').select('permission_key').eq('role_id', member.roleId ?? '')
  if (perms.error) throw perms.error
  return {
    member,
    access: { isOwner: false, permissions: new Set(perms.data.map((p) => p.permission_key)) },
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const currentUser = useRef<string | null>(null)

  const signOut = useCallback(async (notice?: string) => {
    currentUser.current = null
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } finally {
      clearStoredSession()
      setState({ status: 'signed_out', notice })
    }
  }, [])

  const resolveSession = useCallback(
    async (session: Session | null, force = false) => {
      if (!session) {
        currentUser.current = null
        setState((prev) => (prev.status === 'signed_out' ? prev : { status: 'signed_out' }))
        return
      }
      if (!force && currentUser.current === session.user.id) {
        setState((prev) => (prev.status === 'ready' ? { ...prev, session } : prev))
        return
      }
      currentUser.current = session.user.id
      try {
        const result = await loadMember(session.user.id)
        if (!result) {
          await signOut(NO_ACCESS_NOTICE)
          return
        }
        setState({ status: 'ready', session, ...result })
      } catch {
        currentUser.current = null
        setState({ status: 'error', session })
      }
    },
    [signOut],
  )

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) void resolveSession(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase recomienda no llamar a la base dentro de este callback: lo diferimos.
      setTimeout(() => {
        if (active) void resolveSession(session)
      }, 0)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [resolveSession])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await resolveSession(data.session, true)
  }, [resolveSession])

  const value = useMemo(() => ({ state, signOut, refresh }), [state, signOut, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
