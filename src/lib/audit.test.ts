import { auditActor, describeAuditEntry, type AuditEntry } from './audit'

const lookup = {
  roleNames: new Map([['r1', 'Docente']]),
  permissionLabels: new Map([['mensajes.ver', 'Ver mensajes']]),
}

function entry(partial: Partial<AuditEntry>): AuditEntry {
  return {
    id: 1,
    at: '2026-09-28T12:00:00Z',
    actor_id: 'u1',
    actor_email: 'ilearnwithava@gmail.com',
    action: 'insert',
    entity: 'crm_roles',
    entity_id: 'r1',
    detail: {},
    ...partial,
  }
}

describe('describeAuditEntry', () => {
  it('describe cambios en roles', () => {
    expect(describeAuditEntry(entry({ detail: { despues: { name: 'Docente' } } }), lookup)).toBe('Creó el rol "Docente"')
    expect(
      describeAuditEntry(
        entry({ action: 'update', detail: { antes: { name: 'Profe' }, despues: { name: 'Docente' } } }),
        lookup,
      ),
    ).toBe('Renombró el rol "Profe" como "Docente"')
    expect(describeAuditEntry(entry({ action: 'delete', detail: { antes: { name: 'Viejo' } } }), lookup)).toBe(
      'Borró el rol "Viejo"',
    )
  })

  it('describe permisos sumados y quitados', () => {
    const base = { entity: 'crm_role_permissions', detail: { permiso: 'mensajes.ver' } }
    expect(describeAuditEntry(entry(base), lookup)).toBe('Sumó el permiso "Ver mensajes" al rol "Docente"')
    expect(describeAuditEntry(entry({ ...base, action: 'delete', entity_id: 'r9' }), lookup)).toBe(
      'Quitó el permiso "Ver mensajes" del rol "un rol borrado"',
    )
  })

  it('describe cambios en el equipo', () => {
    const before = { email: 'ana@example.com', active: true, role_id: 'r1', display_name: 'Ana' }
    expect(
      describeAuditEntry(
        entry({ entity: 'crm_members', action: 'update', detail: { antes: before, despues: { ...before, active: false } } }),
        lookup,
      ),
    ).toBe('A ana@example.com: desactivó su acceso')
    expect(
      describeAuditEntry(entry({ entity: 'crm_members', action: 'invitar', detail: { email: 'ana@example.com' } }), lookup),
    ).toBe('Invitó a ana@example.com al equipo')
    expect(
      describeAuditEntry(entry({ entity: 'crm_members', action: 'delete', detail: { antes: before } }), lookup),
    ).toBe('Quitó a ana@example.com del equipo')
  })

  it('muestra "Sistema" cuando no hay persona', () => {
    expect(auditActor(entry({ actor_email: null }))).toBe('Sistema')
  })
})
