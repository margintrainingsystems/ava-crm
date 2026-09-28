// Traduce los errores de Supabase a mensajes claros en español.
type ErrorLike = { code?: string; message?: string; status?: number } | null | undefined

const BY_CODE: Record<string, string> = {
  '23505': 'Ya existe un registro con ese nombre.',
  '23503': 'No se puede completar porque otro dato depende de este.',
  '42501': 'No tenés permiso para hacer esto.',
  'P0002': 'No encontramos lo que buscabas. Puede que alguien lo haya borrado.',
  '22001': 'Uno de los textos es demasiado largo.',
  '23514': 'Uno de los datos no tiene el formato esperado.',
  PGRST116: 'No encontramos lo que buscabas.',
  invalid_credentials: 'El email o la contraseña no coinciden.',
  email_not_confirmed: 'Todavía no confirmaste tu email. Revisá la invitación que te llegó.',
  over_request_rate_limit: 'Hiciste muchos intentos seguidos. Esperá unos minutos y probá de nuevo.',
  over_email_send_rate_limit: 'Se enviaron muchos emails seguidos. Esperá unos minutos y probá de nuevo.',
  same_password: 'La contraseña nueva tiene que ser distinta de la anterior.',
  weak_password: 'Esa contraseña es muy fácil de adivinar o apareció en filtraciones. Elegí otra.',
  session_not_found: 'Tu sesión venció. Volvé a entrar.',
  user_banned: 'Esta cuenta está bloqueada.',
}

export function errorMessage(error: unknown, fallback = 'Algo salió mal. Probá de nuevo en unos minutos.'): string {
  const e = error as ErrorLike
  if (!e) return fallback
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code] as string
  if (e.message && /Failed to fetch|NetworkError|Load failed/i.test(e.message)) {
    return 'No hay conexión con el servidor. Revisá tu internet y probá de nuevo.'
  }
  if (e.status === 429) return BY_CODE.over_request_rate_limit as string
  return fallback
}
