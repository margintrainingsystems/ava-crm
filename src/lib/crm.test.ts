import { parseTags, personName } from './crm'

vi.mock('./supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))

describe('parseTags', () => {
  it('normaliza, quita repetidas y vacías', () => {
    expect(parseTags(' Beca, beca ,, VIP ')).toEqual(['beca', 'vip'])
  })

  it('corta en 20 etiquetas de hasta 40 caracteres', () => {
    expect(parseTags(Array.from({ length: 25 }, (_, i) => `t${i}`).join(','))).toHaveLength(20)
    expect(parseTags('x'.repeat(41))).toEqual([])
  })
})

describe('personName', () => {
  it('arma el nombre completo', () => {
    expect(personName({ first_name: 'Ana', last_name: null })).toBe('Ana')
    expect(personName({ first_name: null, last_name: null })).toBe('Sin nombre')
  })
})
