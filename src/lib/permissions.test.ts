// Todas las migraciones en orden: los permisos que se crean menos los que se borran.
const migrations = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true })

function permissionsInMigrations(): string[] {
  const keys = new Set<string>()
  for (const file of Object.keys(migrations).sort()) {
    const sql = migrations[file] as string
    const inserts = sql.match(/insert into public\.crm_permissions[\s\S]*?;/g) ?? []
    inserts.forEach((block) => [...block.matchAll(/\('([a-z_]+\.[a-z_]+)',/g)].forEach((m) => keys.add(m[1] as string)))
    ;[...sql.matchAll(/delete from public\.crm_permissions where key = '([a-z_.]+)'/g)].forEach((m) => keys.delete(m[1] as string))
  }
  return [...keys]
}
import { PERMISSION_KEYS, can, groupPermissions, isPermissionKey, type Permission } from './permissions'

describe('catálogo de permisos', () => {
  it('coincide con los permisos que dejan las migraciones', () => {
    expect(permissionsInMigrations().sort()).toEqual([...PERMISSION_KEYS].sort())
  })

  it('ya no incluye la auditoría, que es solo de la propietaria', () => {
    expect(isPermissionKey('auditoria.ver')).toBe(false)
  })

  it('reconoce claves válidas e inválidas', () => {
    expect(isPermissionKey('pagos.ver')).toBe(true)
    expect(isPermissionKey('pagos.borrar')).toBe(false)
  })
})

describe('groupPermissions', () => {
  const perms: Permission[] = [
    { key: 'b.dos', area: 'B', label: 'Dos', description: '', sort_order: 20 },
    { key: 'a.uno', area: 'A', label: 'Uno', description: '', sort_order: 10 },
    { key: 'b.tres', area: 'B', label: 'Tres', description: '', sort_order: 30 },
  ]

  it('agrupa por área respetando el orden del catálogo', () => {
    const groups = groupPermissions(perms)
    expect(groups.map((g) => g.area)).toEqual(['A', 'B'])
    expect(groups[1]?.permissions.map((p) => p.key)).toEqual(['b.dos', 'b.tres'])
  })

  it('devuelve una lista vacía sin permisos', () => {
    expect(groupPermissions([])).toEqual([])
  })
})

describe('can', () => {
  it('da todo a la propietaria', () => {
    expect(can({ isOwner: true, permissions: new Set() }, 'personas.borrar')).toBe(true)
  })

  it('da solo los permisos del rol al resto', () => {
    const access = { isOwner: false, permissions: new Set(['mensajes.ver']) }
    expect(can(access, 'mensajes.ver')).toBe(true)
    expect(can(access, 'pagos.ver')).toBe(false)
  })

  it('niega todo sin sesión', () => {
    expect(can(null, 'mensajes.ver')).toBe(false)
  })
})
