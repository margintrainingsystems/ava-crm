import { buildTimeline, consentSummary } from './PersonPage'
import type { PersonMessage } from '../lib/crm'

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))

const msg = (partial: Partial<PersonMessage>): PersonMessage => ({
  id: 'm', created_at: '2026-09-28T12:00:00Z', source: 'contacto', motivo: null, message: null, status: 'leido',
  request_code: null, confirmed_at: null, privacy_consent: true, publish_consent: false, adult_confirmed: false, ...partial,
})

describe('ficha de persona', () => {
  it('ordena el historial del más nuevo al más viejo', () => {
    const t = buildTimeline({
      messages: [msg({ id: 'a', created_at: '2026-09-01T00:00:00Z' }), msg({ id: 'b', created_at: '2026-09-03T00:00:00Z' })],
      notes: [{ id: 'n', body: 'x', author_email: null, created_at: '2026-09-02T00:00:00Z' }],
    })
    expect(t.map((i) => (i.kind === 'mensaje' ? i.message.id : i.note.id))).toEqual(['b', 'n', 'a'])
  })

  it('resume los consentimientos del último formulario', () => {
    const c = consentSummary([
      msg({ id: 'old', created_at: '2026-01-01T00:00:00Z', privacy_consent: false }),
      msg({ id: 'new', source: 'suscripcion', created_at: '2026-09-01T00:00:00Z', adult_confirmed: true, publish_consent: false }),
      msg({ id: 'req', source: 'baja', created_at: '2026-09-10T00:00:00Z', privacy_consent: false }),
    ])
    expect(c).toEqual([
      { label: 'Política de privacidad', value: 'Aceptó el 31/08/2026 21:00' },
      { label: 'Mayor de 18', value: 'Lo declaró' },
      { label: 'Publicar su nombre si gana', value: 'No autorizado' },
    ])
  })
})
