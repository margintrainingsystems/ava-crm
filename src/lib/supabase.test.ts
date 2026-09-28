import { clearStoredSession } from './supabase'

describe('clearStoredSession', () => {
  it('borra solo las claves de sesión de Supabase', () => {
    localStorage.setItem('sb-proyecto-auth-token', 'x')
    localStorage.setItem('sb-otra', 'y')
    localStorage.setItem('preferencia', 'z')
    clearStoredSession()
    expect(localStorage.getItem('sb-proyecto-auth-token')).toBeNull()
    expect(localStorage.getItem('sb-otra')).toBeNull()
    expect(localStorage.getItem('preferencia')).toBe('z')
  })
})
