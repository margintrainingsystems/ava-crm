import type { Database } from './database.types'
import { TIME_ZONE } from './format'
import { supabase } from './supabase'

// Plazos legales, pedidos de datos, consentimientos y retención.
// Los plazos se calculan en la base (días hábiles con los feriados que carga la dueña en Núcleo).
// Acá solo se leen y se muestran.

// ---------------------------------------------------------------------------
// Hoy
// ---------------------------------------------------------------------------
export type TodayRequest = {
  id: string
  source: 'arrepentimiento' | 'baja'
  request_code: string | null
  name: string | null
  created_at: string
  deadline: string
  // Estado del email de confirmación automático, si hay uno.
  email_status?: 'pendiente' | 'enviando' | 'enviado' | 'fallido' | 'cancelado' | null
}

export type TodayDataRequest = {
  id: string
  code: string
  kind: DataRequestKind
  name: string | null
  due_date: string
  days_left: number
  identity_verified: boolean
}

export type TodayUnread = { id: string; source: string; name: string | null; motivo: string | null; created_at: string }

// Cada sección llega solo si el rol tiene el permiso que corresponde.
export type Today = {
  today: string
  requests?: TodayRequest[]
  data_requests?: TodayDataRequest[]
  missing_holiday_years?: number[]
  unread?: TodayUnread[]
  unread_count?: number
  expired_count?: number
  failed_emails?: number
  email_ready?: boolean
}

export async function fetchToday(): Promise<Today> {
  const { data, error } = await supabase.rpc('crm_today')
  if (error) throw error
  return data as unknown as Today
}

// ---------------------------------------------------------------------------
// Pedidos de datos personales (Ley 25.326)
// ---------------------------------------------------------------------------
export type DataRequestKind = 'acceso' | 'rectificacion' | 'supresion'
export type DataRequestStatus = 'pendiente' | 'respondido' | 'anulado'
export type DataRequestChannel = 'email' | 'whatsapp' | 'formulario' | 'otro'

export const DATA_REQUEST_KINDS: DataRequestKind[] = ['acceso', 'rectificacion', 'supresion']

export const DATA_REQUEST_KIND_LABEL: Record<DataRequestKind, string> = {
  acceso: 'Acceso',
  rectificacion: 'Rectificación o actualización',
  supresion: 'Supresión',
}

export const DATA_REQUEST_KIND_HELP: Record<DataRequestKind, string> = {
  acceso: 'Quiere saber qué datos guardamos. Plazo: 10 días corridos.',
  rectificacion: 'Quiere corregir o actualizar sus datos. Plazo: 5 días hábiles.',
  supresion: 'Quiere que borremos sus datos o salir de una lista. Plazo: 5 días hábiles.',
}

export const DATA_REQUEST_STATUS_LABEL: Record<DataRequestStatus, string> = {
  pendiente: 'Pendiente',
  respondido: 'Respondido',
  anulado: 'Anulado',
}

export const CHANNEL_LABEL: Record<DataRequestChannel, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  formulario: 'Formulario del sitio',
  otro: 'Otro',
}

type ListRow = Database['public']['Functions']['crm_data_requests_list']['Returns'][number]
// Los tipos generados no marcan qué columnas pueden venir vacías: lo aclaramos acá.
export type DataRequest = Omit<
  ListRow,
  | 'kind'
  | 'status'
  | 'channel'
  | 'person_id'
  | 'person_name'
  | 'requester_name'
  | 'requester_email'
  | 'detail'
  | 'days_left'
  | 'resolved_at'
  | 'resolved_on_time'
  | 'resolution_note'
  | 'previous_access_at'
  | 'created_by_email'
> & {
  kind: DataRequestKind
  status: DataRequestStatus
  channel: DataRequestChannel
  person_id: string | null
  person_name: string | null
  requester_name: string | null
  requester_email: string | null
  detail: string | null
  days_left: number | null
  resolved_at: string | null
  resolved_on_time: boolean | null
  resolution_note: string | null
  previous_access_at: string | null
  created_by_email: string | null
}

export async function fetchDataRequests(): Promise<DataRequest[]> {
  const { data, error } = await supabase.rpc('crm_data_requests_list')
  if (error) throw error
  return data as DataRequest[]
}

export type NewDataRequest = {
  kind: DataRequestKind
  receivedAt: string
  personId?: string | null
  requesterName?: string
  requesterEmail?: string
  channel: DataRequestChannel
  detail?: string
}

export async function createDataRequest(input: NewDataRequest): Promise<{ id: string; code: string; due_date: string }> {
  const { data, error } = await supabase.rpc('crm_data_request_create', {
    p_kind: input.kind,
    p_received_at: input.receivedAt,
    p_person_id: input.personId ?? undefined,
    p_requester_name: input.requesterName || undefined,
    p_requester_email: input.requesterEmail || undefined,
    p_channel: input.channel,
    p_detail: input.detail || undefined,
  })
  if (error) throw error
  return data as { id: string; code: string; due_date: string }
}

export async function updateDataRequest(id: string, identityVerified: boolean, detail: string): Promise<void> {
  const { error } = await supabase.rpc('crm_data_request_update', {
    p_id: id,
    p_identity_verified: identityVerified,
    p_detail: detail,
  })
  if (error) throw error
}

export async function closeDataRequest(id: string, status: 'respondido' | 'anulado', note: string): Promise<void> {
  const { error } = await supabase.rpc('crm_data_request_close', { p_id: id, p_status: status, p_note: note })
  if (error) throw error
}

// Feriados cargados por año, para avisar cuando falta alguno.
export async function fetchHolidayYears(): Promise<number[]> {
  const { data, error } = await supabase.from('crm_holidays').select('day')
  if (error) throw error
  return [...new Set(data.map((h) => Number(h.day.slice(0, 4))))].sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------
// Consentimientos
// ---------------------------------------------------------------------------
export type ConsentKind = 'privacidad' | 'mayor_de_edad' | 'publicar_nombre'

export type Consent = {
  id: string
  kind: ConsentKind
  granted: boolean
  source: string
  recorded_at: string
  recorded_by_email: string | null
}

export const CONSENT_LABEL: Record<ConsentKind, string> = {
  privacidad: 'Política de privacidad',
  mayor_de_edad: 'Declaró ser mayor de 18',
  publicar_nombre: 'Publicar su nombre si gana una beca',
}

const CONSENT_ORDER: ConsentKind[] = ['privacidad', 'mayor_de_edad', 'publicar_nombre']

// La constancia más reciente de cada tipo manda.
export function currentConsents(consents: Consent[]): Consent[] {
  const latest = new Map<ConsentKind, Consent>()
  for (const c of consents) {
    const prev = latest.get(c.kind)
    if (!prev || c.recorded_at > prev.recorded_at) latest.set(c.kind, c)
  }
  return CONSENT_ORDER.flatMap((k) => latest.get(k) ?? [])
}

export async function withdrawPublishConsent(personId: string): Promise<void> {
  const { error } = await supabase.rpc('crm_consent_withdraw', { p_person_id: personId, p_kind: 'publicar_nombre' })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Retención
// ---------------------------------------------------------------------------
type RetentionRow = Database['public']['Functions']['crm_retention_list']['Returns'][number]
export type ExpiredLead = Omit<RetentionRow, 'person_id' | 'first_name' | 'last_name' | 'request_code'> & {
  person_id: string | null
  first_name: string | null
  last_name: string | null
  request_code: string | null
}

// Según la Política de privacidad publicada en el sitio.
export const RETENTION_RULE: Record<string, string> = {
  contacto: '2 años desde el último intercambio',
  arrepentimiento: '3 años desde el pedido',
  baja: '3 años desde el pedido',
  suscripcion: 'Hasta el sorteo de becas o hasta que pida salir',
}

export async function fetchExpired(): Promise<ExpiredLead[]> {
  const { data, error } = await supabase.rpc('crm_retention_list')
  if (error) throw error
  return data as ExpiredLead[]
}

export async function purgeExpired(ids: string[]): Promise<{ mensajes: number; personas: number }> {
  const { data, error } = await supabase.rpc('crm_retention_purge', { p_ids: ids })
  if (error) throw error
  return data as { mensajes: number; personas: number }
}

// ---------------------------------------------------------------------------
// Fechas y plazos
// ---------------------------------------------------------------------------
const dayFormat = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
const weekdayFormat = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long' })

// Una fecha sin hora ('2026-10-05') se muestra tal cual, sin correrse por la zona horaria.
export function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return '—'
  return `${weekdayFormat.format(d)} ${dayFormat.format(d)}`
}

export type DueTone = 'late' | 'soon' | 'ok'

export function dueTone(daysLeft: number): DueTone {
  if (daysLeft < 0) return 'late'
  if (daysLeft <= 2) return 'soon'
  return 'ok'
}

export function dueText(daysLeft: number): string {
  if (daysLeft < -1) return `Venció hace ${-daysLeft} días`
  if (daysLeft === -1) return 'Venció ayer'
  if (daysLeft === 0) return 'Vence hoy'
  if (daysLeft === 1) return 'Vence mañana'
  return `Vence en ${daysLeft} días`
}

export function isPast(at: string, now: Date = new Date()): boolean {
  return new Date(at).getTime() < now.getTime()
}

export function hoursLeftText(deadline: string, now: Date = new Date()): string {
  const ms = new Date(deadline).getTime() - now.getTime()
  if (ms <= 0) return 'Venció el plazo de 24 horas'
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'Quedan menos de 1 hora'
  return hours === 1 ? 'Queda 1 hora' : `Quedan ${hours} horas`
}

const inputFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

// Valor para un <input type="datetime-local"> con la hora de Buenos Aires.
export function toLocalInput(date: Date = new Date()): string {
  return inputFormat.format(date).replace(' ', 'T')
}

// Argentina usa UTC−3 todo el año: la hora que se escribe es la de Buenos Aires.
export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const d = new Date(`${value}:00-03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function yearsText(years: number[]): string {
  if (years.length <= 1) return years.join('')
  return `${years.slice(0, -1).join(', ')} y ${years[years.length - 1]}`
}
