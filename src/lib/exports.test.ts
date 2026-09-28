import { messagesCsv, peopleCsv, personDataPackage } from './exports'
import type { Message } from './messages'

const m: Message = {
  id: '1', created_at: '2026-09-28T12:00:00Z', source: 'suscripcion', name: 'Ana', last_name: 'Pérez',
  email: 'ana@example.com', phone: null, contact_hidden: false, country: 'Argentina', motivo: null, message: null,
  status: 'leido', notes: 'nota', request_code: null, confirmed_at: null, privacy_consent: true,
  publish_consent: true, adult_confirmed: true, person_id: 'p1', can_handle: true,
}

describe('exportaciones', () => {
  it('mensajes con las mismas columnas que Núcleo', () => {
    const lines = messagesCsv([m]).slice(1).split('\r\n')
    expect(lines[0]?.split(';')).toHaveLength(15)
    expect(lines[1]).toContain('"Lista de espera"')
    expect(lines[1]).toContain('"Leído"')
  })

  it('personas', () => {
    const csv = peopleCsv([
      {
        id: 'p1', first_name: 'Ana', last_name: 'Pérez', email: null, phone: null, contact_hidden: true,
        country: 'Uruguay', tags: ['beca'], created_at: m.created_at, last_activity_at: m.created_at,
        message_count: 2, sources: ['contacto', 'suscripcion'],
      },
    ])
    expect(csv).toContain('"Contacto, Lista de espera"')
    expect(csv).toContain('"beca"')
  })

  it('paquete de datos de una persona', () => {
    const json = JSON.parse(
      personDataPackage(
        {
          person: {
            id: 'p1', first_name: 'Ana', last_name: 'Pérez', email: 'ana@example.com', phone: null,
            contact_hidden: false, country: null, tags: [], created_at: m.created_at, last_activity_at: m.created_at,
          },
          messages: [{ ...m, id: 'm1' }],
          hidden_messages: 0,
          notes: [{ id: 'n1', body: 'Llamé', author_email: 'x@example.com', created_at: m.created_at }],
        },
        new Date('2026-09-28T15:00:00Z'),
      ),
    )
    expect(json.persona.email).toBe('ana@example.com')
    expect(json.mensajes[0].tipo).toBe('Lista de espera')
    expect(json.mensajes[0].declaro_ser_mayor).toBe(true)
    expect(json.notas_internas[0]).toEqual({ fecha: m.created_at, texto: 'Llamé' })
    // No incluye quién escribió la nota: es un dato del equipo, no de la persona.
    expect(JSON.stringify(json)).not.toContain('x@example.com')
  })
})
