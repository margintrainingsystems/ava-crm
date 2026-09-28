import { auditActor, auditPersonLink, describeAuditEntry, type AuditEntry } from './audit'

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

describe('describeAuditEntry en personas y mensajes', () => {
  const lookup = { roleNames: new Map<string, string>(), permissionLabels: new Map<string, string>() }
  const base = { id: 9, at: '2026-09-28T12:00:00Z', actor_id: 'u', actor_email: 'a@example.com', entity_id: 'p1' }

  it('describe pedidos y mensajes', () => {
    expect(describeAuditEntry({ ...base, action: 'confirmar_pedido', entity: 'leads', detail: { codigo: 'ARR-1' } }, lookup)).toBe(
      'Confirmó el pedido ARR-1',
    )
    expect(
      describeAuditEntry({ ...base, action: 'borrar_mensaje', entity: 'leads', detail: { tipo: 'suscripcion' } }, lookup),
    ).toBe('Borró un mensaje de lista de espera')
  })

  it('describe fichas sin mostrar datos personales', () => {
    expect(
      describeAuditEntry({ ...base, action: 'editar_persona', entity: 'crm_people', detail: { campos: ['pais', 'telefono'] } }, lookup),
    ).toBe('Editó una ficha: país, teléfono')
    expect(
      describeAuditEntry({ ...base, action: 'borrar_persona', entity: 'crm_people', detail: { mensajes: 3, notas: 1 } }, lookup),
    ).toBe('Borró a una persona con 3 mensajes y 1 nota')
    expect(auditPersonLink({ ...base, action: 'ver_persona', entity: 'crm_people', detail: {} })).toBe('/personas/p1')
    expect(auditPersonLink({ ...base, action: 'borrar_persona', entity: 'crm_people', detail: {} })).toBeNull()
  })
})
