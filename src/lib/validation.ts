// Mismo criterio que Núcleo: un email válido no tiene espacios, saltos de línea,
// comas, punto y coma ni signos que permitan inyectar destinatarios en un mailto:.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string): boolean {
  const email = value.trim()
  if (email.length < 3 || email.length > 320) return false
  if (email.includes('..')) return false
  return EMAIL_RE.test(email)
}

export const PASSWORD_MIN_LENGTH = 10

// Devuelve el problema de la contraseña, o null si sirve.
export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña necesita al menos ${PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Usá letras y números en la contraseña.'
  }
  if (password !== confirmation) {
    return 'Las dos contraseñas no coinciden.'
  }
  return null
}

export const ROLE_NAME_MAX = 60
export const ROLE_DESCRIPTION_MAX = 300
export const DISPLAY_NAME_MAX = 120
