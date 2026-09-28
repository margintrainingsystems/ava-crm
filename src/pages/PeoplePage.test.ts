import { filterPeople, normalizeSearch } from './PeoplePage'
import type { PersonSummary } from '../lib/crm'

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))

const base: PersonSummary = {
  id: '1', first_name: 'Lucía', last_name: 'Gómez', email: 'lucia@example.com', phone: null, contact_hidden: false,
  country: 'Uruguay', tags: ['beca'], created_at: '', last_activity_at: '', message_count: 1, sources: ['suscripcion'],
}
const people = [base, { ...base, id: '2', first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com', tags: [], sources: ['contacto'] }]

describe('búsqueda de personas', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizeSearch('  LUCÍA ')).toBe('lucia')
    expect(filterPeople(people, 'lucia gomez', 'todas').map((p) => p.id)).toEqual(['1'])
  })

  it('busca por email, país y etiqueta', () => {
    expect(filterPeople(people, 'juan@', 'todas').map((p) => p.id)).toEqual(['2'])
    expect(filterPeople(people, 'uruguay beca', 'todas').map((p) => p.id)).toEqual(['1'])
  })

  it('filtra por formulario', () => {
    expect(filterPeople(people, '', 'contacto').map((p) => p.id)).toEqual(['2'])
  })
})
