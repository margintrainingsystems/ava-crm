import { isValidEmail, normalizeEmail, passwordProblem } from './validation'

describe('isValidEmail', () => {
  it.each(['ana@example.com', 'ana.perez+crm@aprendeconava.com', 'a@b.co'])('acepta %s', (email) => {
    expect(isValidEmail(email)).toBe(true)
  })

  it.each([
    '',
    'ana',
    'ana@',
    'ana@example',
    'ana perez@example.com',
    'ana@example.com,otro@example.com',
    'ana@example.com\nbcc:otro@example.com',
    'ana@example.com?subject=hola',
    'ana..perez@example.com',
    `${'a'.repeat(320)}@example.com`,
  ])('rechaza %j', (email) => {
    expect(isValidEmail(email)).toBe(false)
  })

  it('normaliza espacios y mayúsculas', () => {
    expect(normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com')
  })
})

describe('passwordProblem', () => {
  it('pide un largo mínimo', () => {
    expect(passwordProblem('abc123', 'abc123')).toMatch(/al menos 10/)
  })

  it('pide letras y números', () => {
    expect(passwordProblem('soloLetrasAca', 'soloLetrasAca')).toMatch(/letras y números/)
    expect(passwordProblem('1234567890', '1234567890')).toMatch(/letras y números/)
  })

  it('pide que las dos coincidan', () => {
    expect(passwordProblem('clave12345a', 'clave12345b')).toMatch(/no coinciden/)
  })

  it('acepta una contraseña válida', () => {
    expect(passwordProblem('clave12345a', 'clave12345a')).toBeNull()
  })
})
