import { firstName, formatDate, formatDateTime, plural } from './format'

describe('fechas en hora de Buenos Aires', () => {
  it('convierte UTC a la hora de Argentina', () => {
    expect(formatDateTime('2026-09-28T03:30:00Z')).toBe('28/09/2026 00:30')
    expect(formatDateTime('2026-09-28T02:59:00Z')).toBe('27/09/2026 23:59')
  })

  it('muestra un guion sin fecha', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('no es una fecha')).toBe('—')
    expect(formatDate(undefined)).toBe('—')
  })

  it('escribe la fecha larga en español', () => {
    expect(formatDate('2026-09-28T15:00:00Z')).toBe('28 de septiembre de 2026')
  })
})

describe('firstName', () => {
  it('usa el primer nombre', () => {
    expect(firstName('Aimar Merino', 'x@example.com')).toBe('Aimar')
  })

  it('usa el email si no hay nombre', () => {
    expect(firstName('  ', 'ilearnwithava@gmail.com')).toBe('ilearnwithava')
  })
})

describe('plural', () => {
  it('elige singular o plural', () => {
    expect(plural(1, 'permiso', 'permisos')).toBe('1 permiso')
    expect(plural(0, 'permiso', 'permisos')).toBe('0 permisos')
    expect(plural(3, 'persona', 'personas')).toBe('3 personas')
  })
})
