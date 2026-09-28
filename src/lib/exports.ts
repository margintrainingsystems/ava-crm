import { buildCsv } from './csv'
import { CONSENT_LABEL } from './compliance'
import type { PersonDetail, PersonSummary } from './crm'
import { formatDateTime } from './format'
import { SOURCE_LABEL, isRequest, sourceLabel, statusLabel, type Message, type Source } from './messages'

// Exportaciones del CRM. Mismas columnas que Núcleo para los mensajes.

export function messagesCsv(messages: Message[]): string {
  const header = [
    'Fecha', 'Tipo', 'Código', 'Nombre', 'Apellido', 'Email', 'Teléfono', 'País', 'Motivo u operación',
    'Mensaje', 'Estado', 'Confirmado', 'Aceptó privacidad', 'Autorizó publicar su nombre', 'Notas',
  ]
  const rows = messages.map((m) => [
    formatDateTime(m.created_at),
    SOURCE_LABEL[m.source as Source] ?? m.source,
    m.request_code,
    m.name,
    m.last_name,
    m.email,
    m.phone,
    m.country,
    m.motivo,
    m.message,
    statusLabel(m.status),
    m.confirmed_at ? formatDateTime(m.confirmed_at) : '',
    isRequest(m.source) ? '' : m.privacy_consent ? 'Sí' : 'No',
    m.source === 'suscripcion' ? (m.publish_consent ? 'Sí' : 'No') : '',
    m.notes,
  ])
  return buildCsv(header, rows)
}

export function peopleCsv(people: PersonSummary[]): string {
  const header = ['Nombre', 'Apellido', 'Email', 'Teléfono', 'País', 'Etiquetas', 'Llegó por', 'Mensajes', 'Primera vez', 'Última actividad']
  const rows = people.map((p) => [
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    p.country,
    p.tags.join(', '),
    p.sources.map(sourceLabel).join(', '),
    p.message_count,
    formatDateTime(p.created_at),
    formatDateTime(p.last_activity_at),
  ])
  return buildCsv(header, rows)
}

// Paquete con todos los datos de una persona: sirve para responder un pedido de acceso
// (Ley 25.326, art. 14). Incluye solo lo que el rol de quien descarga puede ver.
export function personDataPackage(detail: PersonDetail, generatedAt: Date = new Date()): string {
  const p = detail.person
  return JSON.stringify(
    {
      generado: generatedAt.toISOString(),
      persona: {
        nombre: p.first_name,
        apellido: p.last_name,
        email: p.email,
        telefono: p.phone,
        pais: p.country,
        etiquetas: p.tags,
        primera_vez: p.created_at,
      },
      mensajes: detail.messages.map((m) => ({
        fecha: m.created_at,
        tipo: sourceLabel(m.source),
        codigo: m.request_code,
        motivo_u_operacion: m.motivo,
        mensaje: m.message,
        acepto_privacidad: isRequest(m.source) ? null : m.privacy_consent,
        declaro_ser_mayor: m.source === 'suscripcion' ? m.adult_confirmed : null,
        autorizo_publicar_su_nombre: m.source === 'suscripcion' ? m.publish_consent : null,
      })),
      constancias_de_consentimiento: detail.consents.map((c) => ({
        fecha: c.recorded_at,
        tipo: CONSENT_LABEL[c.kind] ?? c.kind,
        otorgado: c.granted,
        origen: c.source,
      })),
      emails: (detail.emails ?? [])
        .filter((e) => e.status === 'enviado')
        .map((e) => ({ fecha: e.sent_at, asunto: e.subject, texto: e.body })),
      notas_internas: detail.notes.map((n) => ({ fecha: n.created_at, texto: n.body })),
    },
    null,
    2,
  )
}
