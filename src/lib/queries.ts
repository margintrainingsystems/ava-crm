import { supabase } from './supabase'
import type { Permission } from './permissions'
import type { AuditEntry } from './audit'

export type RoleSummary = {
  id: string
  name: string
  description: string
  permissionKeys: string[]
  memberCount: number
}

export type TeamMember = {
  userId: string
  email: string
  displayName: string
  isOwner: boolean
  active: boolean
  roleId: string | null
  createdAt: string
}

export async function fetchPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase
    .from('crm_permissions')
    .select('key, area, label, description, sort_order')
    .order('sort_order')
  if (error) throw error
  return data
}

export async function fetchRoles(): Promise<RoleSummary[]> {
  const [roles, members] = await Promise.all([
    supabase.from('crm_roles').select('id, name, description, crm_role_permissions(permission_key)').order('name'),
    // Solo la propietaria ve a todo el equipo; el resto ve su propia fila.
    supabase.from('crm_members').select('role_id'),
  ])
  if (roles.error) throw roles.error
  if (members.error) throw members.error
  const counts = new Map<string, number>()
  for (const m of members.data) {
    if (m.role_id) counts.set(m.role_id, (counts.get(m.role_id) ?? 0) + 1)
  }
  return roles.data.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissionKeys: r.crm_role_permissions.map((p) => p.permission_key),
    memberCount: counts.get(r.id) ?? 0,
  }))
}

export async function saveRole(input: {
  id: string | null
  name: string
  description: string
  permissionKeys: string[]
}): Promise<string> {
  const { data, error } = await supabase.rpc('crm_save_role', {
    // La función acepta null para crear un rol nuevo; los tipos generados no lo reflejan.
    p_id: input.id as string,
    p_name: input.name,
    p_description: input.description,
    p_permissions: input.permissionKeys,
  })
  if (error) throw error
  return data
}

export async function deleteRole(id: string): Promise<void> {
  const { data, error } = await supabase.from('crm_roles').delete().eq('id', id).select('id')
  if (error) throw error
  if (data.length === 0) throw Object.assign(new Error('Sin filas'), { code: 'P0002' })
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('crm_members')
    .select('user_id, email, display_name, is_owner, active, role_id, created_at')
    .order('is_owner', { ascending: false })
    .order('created_at')
  if (error) throw error
  return data.map((m) => ({
    userId: m.user_id,
    email: m.email,
    displayName: m.display_name,
    isOwner: m.is_owner,
    active: m.active,
    roleId: m.role_id,
    createdAt: m.created_at,
  }))
}

// Cambia datos de una persona del equipo. Devuelve error si la fila no cambió
// (por ejemplo, porque RLS la bloqueó), igual que el helper de Núcleo.
export async function updateMember(
  userId: string,
  changes: Partial<{ display_name: string; role_id: string; active: boolean }>,
): Promise<void> {
  const { data, error } = await supabase.from('crm_members').update(changes).eq('user_id', userId).select('user_id')
  if (error) throw error
  if (data.length === 0) throw Object.assign(new Error('Sin filas'), { code: '42501' })
}

export async function removeMember(userId: string): Promise<void> {
  const { data, error } = await supabase.from('crm_members').delete().eq('user_id', userId).select('user_id')
  if (error) throw error
  if (data.length === 0) throw Object.assign(new Error('Sin filas'), { code: '42501' })
}

export const AUDIT_PAGE_SIZE = 50

export type AuditFilter = 'todo' | 'equipo' | 'roles'

export async function fetchAudit(filter: AuditFilter, before: number | null): Promise<AuditEntry[]> {
  let query = supabase
    .from('crm_audit_log')
    .select('id, at, actor_id, actor_email, action, entity, entity_id, detail')
    .order('id', { ascending: false })
    .limit(AUDIT_PAGE_SIZE)
  if (filter === 'equipo') query = query.eq('entity', 'crm_members')
  if (filter === 'roles') query = query.in('entity', ['crm_roles', 'crm_role_permissions'])
  if (before !== null) query = query.lt('id', before)
  const { data, error } = await query
  if (error) throw error
  return data
}
