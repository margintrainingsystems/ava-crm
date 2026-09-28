import { buildTimeline, consentText } from './PersonPage'
import type { PersonMessage } from '../lib/crm'

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))

const msg = (partial: Partial<PersonMessage>): PersonMessage => ({
  id: 'm', created_at: '2026-09-28T12:00:00Z', source: 'contacto', motivo: null, message: null, status: 'leido',
  request_code: null, confirmed_at: null, privacy_consent: true, publish_consent: false, adult_confirmed: false, expires_at: null, ...partial,
})

describe('ficha de persona', () => {
  it('ordena el historial del más nuevo al más viejo', () => {
    const t = buildTimeline({
      messages: [msg({ id: 'a', created_at: '2026-09-01T00:00:00Z' }), msg({ id: 'b', created_at: '2026-09-03T00:00:00Z' })],
      notes: [{ id: 'n', body: 'x', author_email: null, created_at: '2026-09-02T00:00:00Z' }],
    })
    expect(t.map((i) => (i.kind === 'mensaje' ? i.message.id : i.note.id))).toEqual(['b', 'n', 'a'])
  })

  it('describe cada constancia de consentimiento', () => {
    const base = { id: 'c', recorded_by_email: null, recorded_at: '2026-09-01T15:00:00Z' }
    expect(consentText({ ...base, kind: 'privacidad', granted: true, source: 'suscripcion' })).toBe(
      'Sí, desde el 1 de septiembre de 2026 (Lista de espera)',
    )
    expect(consentText({ ...base, kind: 'publicar_nombre', granted: false, source: 'equipo' })).toBe(
      'Retirado el 1 de septiembre de 2026',
    )
    expect(consentText({ ...base, kind: 'mayor_de_edad', granted: true, source: 'equipo' })).toBe(
      'Sí, registrado por el equipo el 1 de septiembre de 2026',
    )
  })
})
