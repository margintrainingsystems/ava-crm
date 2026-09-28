import { linkErrorFromHash } from './SetPasswordPage'

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))

describe('linkErrorFromHash', () => {
  it('detecta un link vencido', () => {
    expect(linkErrorFromHash('#error=access_denied&error_code=otp_expired&error_description=x')).toBe(
      'El link venció o ya se usó.',
    )
  })

  it('detecta otros errores', () => {
    expect(linkErrorFromHash('#error=server_error')).toBe('El link no es válido.')
  })

  it('no marca error en un link válido', () => {
    expect(linkErrorFromHash('#access_token=abc&type=invite')).toBeNull()
    expect(linkErrorFromHash('')).toBeNull()
  })
})
