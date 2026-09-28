import type { Json } from './database.types'
import type { Message, Status } from './messages'
import { supabase } from './supabase'

// Consultas de personas y mensajes. Todas pasan por funciones de la base que revisan
// el permiso de quien llama y ocultan email y teléfono cuando corresponde.

export async function fetchMessages(): Promise<Message[]> {
  const { data, error } = await supabase.rpc('crm_messages_list')
  if (error) throw error
  return data as Message[]
}

export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('crm_messages_unread_count')
  if (error) throw error
  return data
}

export async function setMessageStatus(id: string, status: Status): Promise<void> {
  const { error } = await supabase.rpc('crm_message_update', { p_id: id, p_status: status })
  if (error) throw error
}

export async function saveMessageNotes(id: string, notes: string): Promise<void> {
  const { error } = await supabase.rpc('crm_message_update', { p_id: id, p_notes: notes, p_set_notes: true })
  if (error) throw error
}

export async function confirmRequest(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('crm_message_confirm', { p_id: id })
  if (error) throw error
  return data
}

export async function deleteMessage(id: string): Promise<void> {
  const { error } = await supabase.rpc('crm_message_delete', { p_id: id })
  if (error) throw error
}

export type PersonSummary = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  contact_hidden: boolean
  country: string | null
  tags: string[]
  created_at: string
  last_activity_at: string
  message_count: number
  sources: string[]
}

export async function fetchPeople(): Promise<PersonSummary[]> {
  const { data, error } = await supabase.rpc('crm_people_list')
  if (error) throw error
  return data as PersonSummary[]
}

export type PersonMessage = {
  id: string
  created_at: string
  source: string
  motivo: string | null
  message: string | null
  status: string
  request_code: string | null
  confirmed_at: string | null
  privacy_consent: boolean
  publish_consent: boolean
  adult_confirmed: boolean
}

export type PersonNote = { id: string; body: string; author_email: string | null; created_at: string }

export type PersonDetail = {
  person: Omit<PersonSummary, 'message_count' | 'sources'>
  messages: PersonMessage[]
  hidden_messages: number
  notes: PersonNote[]
}

export async function fetchPerson(id: string): Promise<PersonDetail> {
  const { data, error } = await supabase.rpc('crm_person_detail', { p_id: id })
  if (error) throw error
  return data as unknown as PersonDetail
}

export type PersonChanges = {
  first_name: string
  last_name: string
  country: string
  tags: string[]
  email?: string
  phone?: string
}

export async function updatePerson(id: string, changes: PersonChanges): Promise<void> {
  const { error } = await supabase.rpc('crm_person_update', {
    p_id: id,
    p_first_name: changes.first_name,
    p_last_name: changes.last_name,
    p_country: changes.country,
    p_tags: changes.tags,
    p_email: changes.email,
    p_phone: changes.phone,
  })
  if (error) throw error
}

export async function addPersonNote(id: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('crm_person_add_note', { p_id: id, p_body: body })
  if (error) throw error
}

export async function deletePerson(id: string): Promise<void> {
  const { error } = await supabase.rpc('crm_person_delete', { p_id: id })
  if (error) throw error
}

// Deja constancia de una exportación. Si falla, la descarga igual sigue.
export async function logExport(action: string, entity: string, detail: Record<string, Json>, entityId?: string) {
  await supabase.rpc('crm_log', { p_action: action, p_entity: entity, p_entity_id: entityId, p_detail: detail })
}

// Etiquetas escritas separadas por coma: minúsculas, sin repetir y sin vacías.
export function parseTags(value: string): string[] {
  const tags = value
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 40)
  return [...new Set(tags)].slice(0, 20)
}

export function personName(p: { first_name: string | null; last_name: string | null }): string {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Sin nombre'
}

// Novedades para refrescar el contador de mensajes sin leer del menú.
export const MESSAGES_CHANGED_EVENT = 'crm:mensajes-cambiaron'
export function notifyMessagesChanged(): void {
  window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT))
}
