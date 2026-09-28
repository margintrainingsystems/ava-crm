import type { Database } from './database.types'
import { formatDateTime } from './format'

// Lo que llega del sitio por los formularios. Mismos textos y reglas que Núcleo → Mensajes.

type Row = Database['public']['Functions']['crm_messages_list']['Returns'][number]
// Los tipos generados no marcan qué columnas pueden venir vacías: lo aclaramos acá.
export type Message = {
  [K in keyof Row]: K extends 'id' | 'created_at' | 'source' | 'status' | 'contact_hidden' | 'can_handle' |
    'privacy_consent' | 'publish_consent' | 'adult_confirmed'
    ? Row[K]
    : Row[K] | null
}

export type Source = 'contacto' | 'suscripcion' | 'arrepentimiento' | 'baja'
export type Status = 'nuevo' | 'leido' | 'archivado'

export const SOURCES: Source[] = ['contacto', 'suscripcion', 'arrepentimiento', 'baja']

export const SOURCE_LABEL: Record<Source, string> = {
  contacto: 'Contacto',
  suscripcion: 'Lista de espera',
  arrepentimiento: 'Arrepentimiento',
  baja: 'Baja',
}

export const STATUS_LABEL: Record<Status, string> = {
  nuevo: 'Sin leer',
  leido: 'Leído',
  archivado: 'Archivado',
}

const REQUEST_NAME = { arrepentimiento: 'arrepentimiento', baja: 'baja de servicio' } as const

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source as Source] ?? source
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status as Status] ?? status
}

export function isRequest(source: string): source is 'arrepentimiento' | 'baja' {
  return source === 'arrepentimiento' || source === 'baja'
}

export function fullName(name: string | null | undefined, lastName: string | null | undefined): string {
  return `${name ?? ''} ${lastName ?? ''}`.trim() || 'Sin nombre'
}

// Disposición 954/2025: los pedidos se confirman por email dentro de las 24 horas.
export const REQUEST_DEADLINE_HOURS = 24

export type RequestState =
  | { kind: 'confirmado'; at: Date }
  | { kind: 'pendiente'; due: Date }
  | { kind: 'vencido'; due: Date }

export function requestState(createdAt: string, confirmedAt: string | null, now: Date = new Date()): RequestState {
  if (confirmedAt) return { kind: 'confirmado', at: new Date(confirmedAt) }
  const due = new Date(new Date(createdAt).getTime() + REQUEST_DEADLINE_HOURS * 60 * 60 * 1000)
  return due < now ? { kind: 'vencido', due } : { kind: 'pendiente', due }
}

export function requestStateText(state: RequestState): string {
  if (state.kind === 'confirmado') return `Confirmado el ${formatDateTime(state.at)}`
  if (state.kind === 'vencido') return `Sin confirmar · el plazo venció el ${formatDateTime(state.due)}`
  return `Confirmar por email antes del ${formatDateTime(state.due)}`
}

// Los emails vienen de formularios públicos: solo se arma un link si tiene forma de email
// y ningún carácter que permita agregar asunto, copias o cuerpo al mailto:.
const SAFE_EMAIL = /^[^\s@?&#%<>"',;:()[\]\\]+@[^\s@?&#%<>"',;:()[\]\\]+\.[^\s@?&#%<>"',;:()[\]\\]+$/

export function mailHref(email: string | null | undefined, query?: string): string | null {
  const clean = (email ?? '').trim()
  if (!SAFE_EMAIL.test(clean)) return null
  return `mailto:${clean}${query ? `?${query}` : ''}`
}

export function replyHref(m: Pick<Message, 'email' | 'source'>): string | null {
  const subject = m.source === 'suscripcion' ? 'AVA — lista de espera' : 'Re: tu consulta a AVA'
  return mailHref(m.email, `subject=${encodeURIComponent(subject)}`)
}

// Email de confirmación ya redactado, con el código que exige la norma. Mismo texto que Núcleo.
type TemplateLike = { key: string; subject: string; body: string }

// Usa la plantilla guardada en CRM → Configuración. Si todavía no cargó, el texto de siempre.
export function confirmationText(
  m: Pick<Message, 'source' | 'name' | 'request_code'>,
  templates: TemplateLike[] = [],
): { subject: string; body: string } | null {
  if (!isRequest(m.source)) return null
  const template = templates.find((t) => t.key === `confirmacion_${m.source}`)
  if (template) {
    const values: Record<string, string> = { nombre: (m.name ?? '').trim(), codigo: m.request_code ?? '' }
    const fill = (text: string) => text.replace(/\{([a-z_]+)\}/g, (_, key: string) => values[key] ?? '')
    return { subject: fill(template.subject), body: fill(template.body) }
  }
  const what = REQUEST_NAME[m.source]
  const subject = `AVA — Confirmación de tu pedido de ${what} (${m.request_code ?? ''})`
  const body =
    `Hola ${m.name ?? ''}:\n\n` +
    `Recibimos tu pedido de ${what} de la suscripción a AVA. El código de identificación de tu pedido es ${m.request_code ?? ''}.\n\n` +
    (m.source === 'arrepentimiento'
      ? 'Vamos a gestionar la devolución y te avisamos cuando esté hecha.\n\n'
      : 'Tu suscripción no se va a renovar y mantenés el acceso hasta el final del año contratado.\n\n') +
    'Cualquier duda, respondé este email.\n\nAVA'
  return { subject, body }
}

export function confirmationHref(
  m: Pick<Message, 'source' | 'name' | 'request_code' | 'email'>,
  templates: TemplateLike[] = [],
): string | null {
  const text = confirmationText(m, templates)
  if (!text) return null
  return mailHref(m.email, `subject=${encodeURIComponent(text.subject)}&body=${encodeURIComponent(text.body)}`)
}

export function whatsappHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? `https://wa.me/${digits}` : null
}

export function emptyMessageText(source: string): string {
  if (isRequest(source)) return `Pedido de ${REQUEST_NAME[source]} (sin comentario).`
  if (source === 'suscripcion') return 'Se anotó en la lista de espera (no escribió un mensaje).'
  return 'Sin mensaje.'
}

export function motivoLabel(source: string): string {
  return isRequest(source) ? 'Operación' : 'Motivo'
}

export function visibleMessages(messages: Message[], source: Source | 'todos', includeArchived: boolean): Message[] {
  return messages.filter((m) => (source === 'todos' || m.source === source) && (includeArchived || m.status !== 'archivado'))
}
