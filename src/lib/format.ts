// Fechas en hora de Buenos Aires, que es la referencia de todos los plazos legales de AVA.
export const TIME_ZONE = 'America/Argentina/Buenos_Aires'

const dateTime = new Intl.DateTimeFormat('es-AR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateOnly = new Intl.DateTimeFormat('es-AR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return dateTime.format(d).replace(',', '')
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return dateOnly.format(d)
}

// Nombre para saludar: el nombre cargado o, si falta, la parte del email antes de la arroba.
export function firstName(displayName: string, email: string): string {
  const name = displayName.trim().split(/\s+/)[0]
  if (name) return name
  return email.split('@')[0] ?? email
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
