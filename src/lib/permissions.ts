// Catálogo de permisos del CRM. Tiene que coincidir con la tabla crm_permissions:
// si agregás o sacás uno, hacelo acá y en una migración nueva.
// Equipo, roles y auditoría no son permisos: los maneja solo la propietaria desde Núcleo.
export const PERMISSION_KEYS = [
  'personas.ver',
  'personas.ver_contacto',
  'personas.editar',
  'personas.exportar',
  'personas.borrar',
  'mensajes.ver',
  'mensajes.responder',
  'pedidos.gestionar',
  'derechos.gestionar',
  'suscripciones.ver',
  'suscripciones.gestionar',
  'pagos.ver',
  'sorteo.gestionar',
  'reportes.ver',
  'configuracion.editar',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export type Permission = {
  key: string
  area: string
  label: string
  description: string
  sort_order: number
}

export type PermissionGroup = {
  area: string
  permissions: Permission[]
}

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value)
}

// Agrupa los permisos por área y respeta el orden del catálogo.
export function groupPermissions(permissions: Permission[]): PermissionGroup[] {
  const sorted = [...permissions].sort((a, b) => a.sort_order - b.sort_order)
  const groups = new Map<string, Permission[]>()
  for (const p of sorted) {
    const list = groups.get(p.area)
    if (list) list.push(p)
    else groups.set(p.area, [p])
  }
  return [...groups.entries()].map(([area, list]) => ({ area, permissions: list }))
}

export type Access = {
  isOwner: boolean
  permissions: ReadonlySet<string>
}

// La propietaria tiene todos los permisos. El resto, solo los de su rol.
export function can(access: Access | null, key: PermissionKey): boolean {
  if (!access) return false
  return access.isOwner || access.permissions.has(key)
}
