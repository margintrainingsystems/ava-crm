import type { Json } from './database.types'
import { plural } from './format'
import { sourceLabel } from './messages'

export type AuditEntry = {
  id: number
  at: string
  actor_id: string | null
  actor_email: string | null
  action: string
  entity: string
  entity_id: string | null
  detail: Json
}

type Lookup = {
  roleNames: ReadonlyMap<string, string>
  permissionLabels: ReadonlyMap<string, string>
}

type Row = Record<string, Json | undefined>

function asRow(value: Json | undefined): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}
}

function text(value: Json | undefined): string {
  return typeof value === 'string' ? value : ''
}

function roleName(id: string | null | undefined, lookup: Lookup): string {
  if (!id) return 'sin rol'
  return `"${lookup.roleNames.get(id) ?? 'un rol borrado'}"`
}

// Frase en español que describe cada registro de la auditoría.
export function describeAuditEntry(entry: AuditEntry, lookup: Lookup): string {
  const detail = asRow(entry.detail)
  const before = asRow(detail.antes)
  const after = asRow(detail.despues)

  if (entry.entity === 'crm_roles') {
    if (entry.action === 'insert') return `Creó el rol "${text(after.name)}"`
    if (entry.action === 'delete') return `Borró el rol "${text(before.name)}"`
    if (text(before.name) !== text(after.name)) {
      return `Renombró el rol "${text(before.name)}" como "${text(after.name)}"`
    }
    return `Editó la descripción del rol "${text(after.name)}"`
  }

  if (entry.entity === 'crm_role_permissions') {
    const key = text(detail.permiso)
    const label = lookup.permissionLabels.get(key) ?? key
    const role = roleName(entry.entity_id, lookup)
    if (entry.action === 'insert') return `Sumó el permiso "${label}" al rol ${role}`
    return `Quitó el permiso "${label}" del rol ${role}`
  }

  if (entry.entity === 'crm_members') {
    if (entry.action === 'invitar') return `Invitó a ${text(detail.email)} al equipo`
    if (entry.action === 'sumar_cuenta_existente') return `Sumó al equipo a ${text(detail.email)}, que ya tenía cuenta`
    if (entry.action === 'reenviar_invitacion') return `Reenvió la invitación a ${text(detail.email)}`
    const email = text(after.email) || text(before.email)
    if (entry.action === 'insert') {
      return after.is_owner === true ? `${email} quedó como propietaria del CRM` : `Sumó a ${email} al equipo`
    }
    if (entry.action === 'delete') return `Quitó a ${email} del equipo`
    const changes: string[] = []
    if (before.active !== after.active) changes.push(after.active ? 'reactivó su acceso' : 'desactivó su acceso')
    if (before.role_id !== after.role_id) changes.push(`le asignó el rol ${roleName(text(after.role_id), lookup)}`)
    if (before.display_name !== after.display_name) changes.push(`cambió su nombre a "${text(after.display_name)}"`)
    if (changes.length === 0) return `Editó a ${email}`
    return `A ${email}: ${changes.join(', ')}`
  }

  if (entry.entity === 'leads') {
    const code = text(detail.codigo)
    if (entry.action === 'confirmar_pedido') return `Confirmó el pedido ${code}`
    if (entry.action === 'borrar_mensaje') {
      return `Borró un mensaje de ${sourceLabel(text(detail.tipo)).toLowerCase()}${code ? ` (${code})` : ''}`
    }
    if (entry.action === 'exportar_mensajes') return `Descargó ${plural(Number(detail.cantidad ?? 0), 'mensaje', 'mensajes')} en CSV`
  }

  if (entry.entity === 'crm_people') {
    if (entry.action === 'ver_persona') {
      return detail.con_contacto === true ? 'Abrió una ficha, con email y teléfono' : 'Abrió una ficha, sin datos de contacto'
    }
    if (entry.action === 'editar_persona') {
      const fields = Array.isArray(detail.campos) ? detail.campos.map((c) => FIELD_LABEL[text(c)] ?? text(c)) : []
      return `Editó una ficha: ${fields.join(', ') || 'sin cambios'}`
    }
    if (entry.action === 'borrar_persona') {
      return `Borró a una persona con ${plural(Number(detail.mensajes ?? 0), 'mensaje', 'mensajes')} y ${plural(Number(detail.notas ?? 0), 'nota', 'notas')}`
    }
    if (entry.action === 'exportar_personas') return `Descargó ${plural(Number(detail.cantidad ?? 0), 'persona', 'personas')} en CSV`
    if (entry.action === 'exportar_persona') return 'Descargó todos los datos de una persona'
  }

  return `${entry.action} en ${entry.entity}`
}

const FIELD_LABEL: Record<string, string> = {
  nombre: 'nombre',
  apellido: 'apellido',
  pais: 'país',
  etiquetas: 'etiquetas',
  email: 'email',
  telefono: 'teléfono',
}

// Los registros de fichas apuntan a una persona que puede seguir existiendo.
export function auditPersonLink(entry: AuditEntry): string | null {
  if (entry.entity !== 'crm_people' || !entry.entity_id || entry.action === 'borrar_persona') return null
  return `/personas/${entry.entity_id}`
}

// Quién hizo el cambio. Las altas que hace el sistema (por ejemplo, una Edge Function) no tienen persona.
export function auditActor(entry: AuditEntry): string {
  return entry.actor_email ?? 'Sistema'
}
