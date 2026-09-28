import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('traduce códigos de Postgres', () => {
    expect(errorMessage({ code: '23505' })).toMatch(/Ya existe/)
    expect(errorMessage({ code: '42501' })).toMatch(/No tenés permiso/)
  })

  it('traduce códigos de Supabase Auth', () => {
    expect(errorMessage({ code: 'invalid_credentials' })).toBe('El email o la contraseña no coinciden.')
    expect(errorMessage({ status: 429 })).toMatch(/muchos intentos/)
  })

  it('detecta problemas de conexión', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toMatch(/conexión/)
  })

  it('usa el mensaje de respaldo', () => {
    expect(errorMessage(null, 'Respaldo')).toBe('Respaldo')
    expect(errorMessage({ code: 'desconocido' }, 'Respaldo')).toBe('Respaldo')
  })
})
