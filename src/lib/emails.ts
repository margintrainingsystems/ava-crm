import type { Database } from './database.types'
import { supabase } from './supabase'

// Emails del CRM. Todo email pasa por una cola en la base; la Edge Function crm-emails los
// manda con Resend. Mientras Resend no esté configurado, quedan pendientes.

export type EmailStatus = 'pendiente' | 'enviando' | 'enviado' | 'fallido' | 'cancelado'
export type EmailKind = 'confirmacion' | 'manual' | 'prueba'

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  pendiente: 'En cola',
  enviando: 'Enviando',
  enviado: 'Enviado',
  fallido: 'Con error',
  cancelado: 'Cancelado',
}

export const EMAIL_KIND_LABEL: Record<EmailKind, string> = {
  confirmacion: 'Confirmación automática',
  manual: 'Escrito por el equipo',
  prueba: 'Prueba de envío',
}

type Row = Database['public']['Functions']['crm_emails_list']['Returns'][number]
// Los tipos generados no marcan qué columnas pueden venir vacías: lo aclaramos acá.
export type Email = Omit<
  Row,
  | 'status'
  | 'kind'
  | 'template_key'
  | 'person_id'
  | 'person_name'
  | 'lead_id'
  | 'lead_source'
  | 'to_email'
  | 'last_error'
  | 'cancel_reason'
  | 'created_by_email'
  | 'sent_at'
> & {
  status: EmailStatus
  kind: EmailKind
  template_key: string | null
  person_id: string | null
  person_name: string | null
  lead_id: string | null
  lead_source: string | null
  to_email: string | null
  last_error: string | null
  cancel_reason: string | null
  created_by_email: string | null
  sent_at: string | null
}

// Lo que muestra la ficha de cada persona.
export type PersonEmail = {
  id: string
  kind: EmailKind
  lead_source: string | null
  subject: string
  body: string
  status: EmailStatus
  created_at: string
  sent_at: string | null
  created_by_email: string | null
  last_error: string | null
  cancel_reason: string | null
}

export async function fetchEmails(): Promise<Email[]> {
  const { data, error } = await supabase.rpc('crm_emails_list')
  if (error) throw error
  return data as Email[]
}

export async function composeEmail(personId: string, subject: string, body: string, leadId?: string): Promise<string> {
  const { data, error } = await supabase.rpc('crm_email_compose', {
    p_person_id: personId,
    p_subject: subject,
    p_body: body,
    p_lead_id: leadId,
  })
  if (error) throw error
  return data
}

export async function cancelEmail(id: string): Promise<void> {
  const { error } = await supabase.rpc('crm_email_cancel', { p_id: id })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Edge Function crm-emails
// ---------------------------------------------------------------------------
export type SendResult = { configurado: boolean; mensaje?: string; enviados?: number; fallidos?: number }

async function callEmailFunction(body: Record<string, unknown>): Promise<SendResult> {
  const { data, error } = await supabase.functions.invoke('crm-emails', { body })
  if (error) {
    let message = 'No hubo respuesta del servicio de emails. Probá de nuevo en unos minutos.'
    try {
      const context = (error as { context?: Response }).context
      if (context && typeof context.json === 'function') {
        const payload = (await context.json()) as { mensaje?: string }
        if (payload.mensaje) message = payload.mensaje
      }
    } catch {
      // La respuesta no era JSON: queda el mensaje general.
    }
    throw new Error(message)
  }
  return data as SendResult
}

export function sendNow(ids: string[]): Promise<SendResult> {
  return callEmailFunction({ action: 'enviar', ids })
}

export function checkEmailService(): Promise<SendResult> {
  return callEmailFunction({ action: 'estado' })
}

export function sendTestEmail(to: string): Promise<SendResult> {
  return callEmailFunction({ action: 'probar', to })
}

// Texto para avisar qué pasó después de "Enviar ahora".
export function sendResultText(result: SendResult, count = 1): string {
  if (!result.configurado) {
    return count === 1
      ? 'Quedó en la cola: sale cuando se activen los envíos con Resend.'
      : 'Quedaron en la cola: salen cuando se activen los envíos con Resend.'
  }
  const sent = result.enviados ?? 0
  const failed = result.fallidos ?? 0
  if (failed === 0 && sent > 0) return sent === 1 ? 'Email enviado.' : `Se enviaron ${sent} emails.`
  if (sent === 0 && failed === 0) return 'Ya se estaba enviando: revisá el estado en un minuto.'
  return failed === 1 ? 'No se pudo enviar: revisá el error en Emails.' : `${failed} emails no se pudieron enviar.`
}

// ---------------------------------------------------------------------------
// Configuración: remitente y plantillas
// ---------------------------------------------------------------------------
export type EmailSettings = Database['public']['Tables']['crm_email_settings']['Row']
export type EmailTemplate = Database['public']['Tables']['crm_email_templates']['Row']

export async function fetchEmailSettings(): Promise<EmailSettings> {
  const { data, error } = await supabase.from('crm_email_settings').select('*').eq('id', 1).single()
  if (error) throw error
  return data
}

export async function saveEmailSettings(input: {
  fromName: string
  fromAddress: string
  replyTo: string
  autoConfirm: boolean
}): Promise<void> {
  const { error } = await supabase.rpc('crm_email_settings_save', {
    p_from_name: input.fromName,
    p_from_address: input.fromAddress,
    p_reply_to: input.replyTo,
    p_auto_confirm: input.autoConfirm,
  })
  if (error) throw error
}

export async function fetchTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase.from('crm_email_templates').select('*').order('key')
  if (error) throw error
  return data
}

export async function saveTemplate(key: string, subject: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('crm_email_template_save', { p_key: key, p_subject: subject, p_body: body })
  if (error) throw error
}

// Igual que crm_private.crm_render en la base: {clave} se reemplaza y lo desconocido queda vacío.
export function renderTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/g, (_, key: string) => values[key] ?? '')
}

// Marcadores que no existen en la plantilla: así no sale un email con un hueco.
export function unknownPlaceholders(text: string, allowed: string[]): string[] {
  const found = [...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1] as string)
  return [...new Set(found.filter((k) => !allowed.includes(k)))]
}

export const PLACEHOLDER_HELP: Record<string, string> = {
  nombre: 'el nombre que escribió en el formulario',
  codigo: 'el código del pedido',
}
