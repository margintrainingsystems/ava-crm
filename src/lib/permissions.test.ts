import migration from '../../supabase/migrations/20260928045339_crm_equipo_roles_permisos.sql?raw'
import { PERMISSION_KEYS, can, groupPermissions, isPermissionKey, type Permission } from './permissions'

describe('catálogo de permisos', () => {
  it('coincide con los permisos que crea la migración', () => {
    const inSql = [...migration.matchAll(/\('([a-z_]+\.[a-z_]+)',/g)].map((m) => m[1])
    expect(inSql.sort()).toEqual([...PERMISSION_KEYS].sort())
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
