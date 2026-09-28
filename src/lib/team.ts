import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { TeamMember } from './queries'

// Cliente de la Edge Function crm-equipo. Solo la propietaria la puede usar.

export type InviteResult = { estado: 'invitada' | 'agregada'; user_id: string }

export type MemberStatus = {
  user_id: string
  invitada_el: string | null
  confirmada: boolean
  ultimo_ingreso: string | null
}

export class TeamFunctionError extends Error {}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('crm-equipo', { body })
  if (error) {
    let message = 'No pudimos completar la operación. Probá de nuevo en unos minutos.'
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = (await error.context.json()) as { mensaje?: string }
        if (payload.mensaje) message = payload.mensaje
      } catch {
        // La respuesta no era JSON: queda el mensaje general.
      }
    }
    throw new TeamFunctionError(message)
  }
  return data as T
}

export function inviteMember(input: { email: string; display_name: string; role_id: string }): Promise<InviteResult> {
  return call<InviteResult>({ action: 'invitar', ...input })
}

export function resendInvitation(userId: string): Promise<{ ok: true }> {
  return call<{ ok: true }>({ action: 'reenviar', user_id: userId })
}

export async function fetchMemberStatuses(): Promise<Map<string, MemberStatus>> {
  const result = await call<{ miembros: MemberStatus[] }>({ action: 'estado' })
  return new Map(result.miembros.map((m) => [m.user_id, m]))
}

// Estado que se muestra en la tabla del equipo.
export type MemberState = 'propietaria' | 'activa' | 'pendiente' | 'desactivada' | 'desconocido'

export function memberState(member: TeamMember, status: MemberStatus | undefined, statusesLoaded: boolean): MemberState {
  if (member.isOwner) return 'propietaria'
  if (!member.active) return 'desactivada'
  if (!statusesLoaded) return 'desconocido'
  if (status && !status.confirmada && !status.ultimo_ingreso) return 'pendiente'
  return 'activa'
}

