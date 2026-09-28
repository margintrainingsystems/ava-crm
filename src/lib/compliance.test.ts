import {
  currentConsents,
  dueText,
  dueTone,
  formatDay,
  fromLocalInput,
  hoursLeftText,
  isPast,
  toLocalInput,
  yearsText,
  type Consent,
} from './compliance'
import { errorMessage } from './errors'

vi.mock('./supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))

const consent = (partial: Partial<Consent>): Consent => ({
  id: 'c', kind: 'privacidad', granted: true, source: 'contacto', recorded_at: '2026-09-01T12:00:00Z',
  recorded_by_email: null, ...partial,
})

describe('plazos', () => {
  it('describe cuánto falta o cuánto pasó', () => {
    expect(dueText(5)).toBe('Vence en 5 días')
    expect(dueText(1)).toBe('Vence mañana')
    expect(dueText(0)).toBe('Vence hoy')
    expect(dueText(-1)).toBe('Venció ayer')
    expect(dueText(-3)).toBe('Venció hace 3 días')
  })

  it('marca en rojo lo vencido y en ámbar lo que vence en dos días o menos', () => {
    expect(dueTone(-1)).toBe('late')
    expect(dueTone(0)).toBe('soon')
    expect(dueTone(2)).toBe('soon')
    expect(dueTone(3)).toBe('ok')
  })

  it('muestra una fecha sin hora sin correrla por la zona horaria', () => {
    expect(formatDay('2026-10-05')).toBe('lunes 5 de octubre de 2026')
    expect(formatDay('no')).toBe('—')
  })

  it('cuenta las horas que quedan para confirmar un pedido', () => {
    const now = new Date('2026-09-28T12:00:00Z')
    expect(hoursLeftText('2026-09-29T11:30:00Z', now)).toBe('Quedan 23 horas')
    expect(hoursLeftText('2026-09-28T13:10:00Z', now)).toBe('Queda 1 hora')
    expect(hoursLeftText('2026-09-28T12:30:00Z', now)).toBe('Quedan menos de 1 hora')
    expect(hoursLeftText('2026-09-28T11:00:00Z', now)).toBe('Venció el plazo de 24 horas')
    expect(isPast('2026-09-28T11:00:00Z', now)).toBe(true)
  })

  it('lee y escribe la hora de Buenos Aires en los campos de fecha', () => {
    expect(toLocalInput(new Date('2026-09-28T15:04:00Z'))).toBe('2026-09-28T12:04')
    expect(fromLocalInput('2026-09-28T12:04')).toBe('2026-09-28T15:04:00.000Z')
    expect(fromLocalInput('28/09/2026')).toBeNull()
  })

  it('arma la lista de años', () => {
    expect(yearsText([2026])).toBe('2026')
    expect(yearsText([2026, 2027])).toBe('2026 y 2027')
    expect(yearsText([2026, 2027, 2028])).toBe('2026, 2027 y 2028')
  })
})

describe('consentimientos', () => {
  it('toma la constancia más reciente de cada tipo, en orden fijo', () => {
    const list = currentConsents([
      consent({ id: 'a', kind: 'publicar_nombre', granted: true, recorded_at: '2026-09-01T00:00:00Z' }),
      consent({ id: 'b', kind: 'publicar_nombre', granted: false, recorded_at: '2026-09-10T00:00:00Z' }),
      consent({ id: 'c', kind: 'privacidad', recorded_at: '2026-08-01T00:00:00Z' }),
    ])
    expect(list.map((c) => [c.kind, c.granted])).toEqual([
      ['privacidad', true],
      ['publicar_nombre', false],
    ])
  })
})

describe('errores de las funciones del CRM', () => {
  it('muestra el motivo en español que manda la base', () => {
    expect(errorMessage({ code: '23514', message: 'El pedido ya está cerrado' })).toBe('El pedido ya está cerrado.')
    expect(errorMessage({ code: '22023', message: 'La fecha de recepción no puede ser futura' })).toBe(
      'La fecha de recepción no puede ser futura.',
    )
  })

  it('no muestra los rechazos de Postgres en inglés', () => {
    expect(errorMessage({ code: '23514', message: 'new row violates check constraint "x"' })).toBe(
      'Uno de los datos no tiene el formato esperado.',
    )
  })
})
