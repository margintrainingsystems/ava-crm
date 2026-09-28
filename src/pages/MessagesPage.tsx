import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMember } from '../auth/context'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import { downloadFile, todayStamp } from '../lib/csv'
import { messagesCsv } from '../lib/exports'
import {
  confirmRequest,
  deleteMessage,
  fetchMessages,
  logExport,
  notifyMessagesChanged,
  saveMessageNotes,
  setMessageStatus,
} from '../lib/crm'
import { fetchTemplates, type EmailTemplate } from '../lib/emails'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import {
  SOURCES,
  SOURCE_LABEL,
  confirmationHref,
  mailHref,
  emptyMessageText,
  fullName,
  isRequest,
  motivoLabel,
  replyHref,
  requestState,
  requestStateText,
  statusLabel,
  visibleMessages,
  whatsappHref,
  type Message,
  type Source,
  type Status,
} from '../lib/messages'
import { can } from '../lib/permissions'
import { useAsync } from '../lib/useAsync'

type Tab = Source | 'todos'

const EMPTY: Partial<Record<Tab, string>> = {
  suscripcion: 'Todavía nadie se anotó en la lista de espera.',
  arrepentimiento: 'No hay pedidos de arrepentimiento.',
  baja: 'No hay pedidos de baja.',
}

const FILE_NAME: Record<Tab, string> = {
  todos: 'mensajes',
  contacto: 'contacto',
  suscripcion: 'lista-de-espera',
  arrepentimiento: 'arrepentimiento',
  baja: 'bajas',
}

export function MessagesPage() {
  const { access } = useMember()
  const toast = useToast()
  const [params] = useSearchParams()
  const openParam = params.get('mensaje')
  const page = useAsync(fetchMessages)
  // Si no cargan, el email de confirmación usa el texto de siempre.
  const templates = useAsync(fetchTemplates)
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [tab, setTab] = useState<Tab>('todos')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [openId, setOpenId] = useState<string | null>(openParam)
  const [deleting, setDeleting] = useState<Message | null>(null)
  // Notas escritas y sin guardar, por mensaje.
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const list = useMemo(() => messages ?? page.data ?? [], [messages, page.data])
  const canSeeMessages = can(access, 'mensajes.ver')
  const canSeeRequests = can(access, 'pedidos.gestionar')
  const tabs: Tab[] = ['todos', ...SOURCES.filter((s) => (isRequest(s) ? canSeeRequests : canSeeMessages))]

  // Si llegan con ?mensaje=..., se muestra aunque esté archivado.
  const opened = list.find((m) => m.id === openParam)
  const showArchived = includeArchived || opened?.status === 'archivado'
  const rows = visibleMessages(list, tab, showArchived)

  const dirtyIds = useMemo(
    () => Object.keys(drafts).filter((id) => drafts[id] !== (list.find((m) => m.id === id)?.notes ?? '')),
    [drafts, list],
  )

  // Nota sin guardar: el navegador pregunta antes de cerrar o recargar la pestaña.
  useEffect(() => {
    if (dirtyIds.length === 0) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirtyIds.length])

  function discardDraftsOk(ids: string[] = dirtyIds): boolean {
    const pending = ids.filter((id) => dirtyIds.includes(id))
    if (pending.length === 0) return true
    if (!window.confirm('Tenés una nota sin guardar. ¿Descartarla?')) return false
    setDrafts((d) => {
      const next = { ...d }
      pending.forEach((id) => delete next[id])
      return next
    })
    return true
  }

  function patch(id: string, changes: Partial<Message>) {
    setMessages((prev) => (prev ?? page.data ?? []).map((m) => (m.id === id ? { ...m, ...changes } : m)))
  }

  async function changeStatus(m: Message, status: Status, quiet = false): Promise<boolean> {
    try {
      await setMessageStatus(m.id, status)
      patch(m.id, { status })
      notifyMessagesChanged()
      return true
    } catch (e) {
      if (!quiet) toast.show(errorMessage(e, 'No se pudo actualizar el mensaje. Probá de nuevo.'), 'error')
      return false
    }
  }

  async function toggle(m: Message) {
    if (openId === m.id) {
      if (!discardDraftsOk([m.id])) return
      setOpenId(null)
      return
    }
    setOpenId(m.id)
    // Abrirlo es leerlo, como en cualquier bandeja de email.
    if (m.status === 'nuevo' && m.can_handle) await changeStatus(m, 'leido', true)
  }

  function exportCsv() {
    if (rows.length === 0) {
      toast.show('No hay nada para descargar con estos filtros.')
      return
    }
    downloadFile(`ava-${FILE_NAME[tab]}-${todayStamp()}.csv`, messagesCsv(rows))
    void logExport('exportar_mensajes', 'leads', { cantidad: rows.length, tipo: tab })
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await deleteMessage(deleting.id)
      setMessages((prev) => (prev ?? page.data ?? []).filter((m) => m.id !== deleting.id))
      setDrafts((d) => {
        const next = { ...d }
        delete next[deleting.id]
        return next
      })
      notifyMessagesChanged()
      toast.show('Mensaje eliminado.')
      setDeleting(null)
    } catch (e) {
      toast.show(errorMessage(e, 'No se pudo eliminar. Probá de nuevo.'), 'error')
    }
  }

  const count = (t: Tab) => visibleMessages(list, t, showArchived).length

  return (
    <section className="stack-lg">
      <header className="page-header">
        <div className="stack-sm">
          <h1 className="h-xl" tabIndex={-1} data-page-title>
            Mensajes
          </h1>
          <p className="text-muted measure">
            Todo lo que llega por los formularios del sitio: contacto, lista de espera y pedidos de arrepentimiento o baja.
          </p>
        </div>
        {can(access, 'personas.exportar') && (
          <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={!page.data}>
            Descargar CSV
          </button>
        )}
      </header>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Tipo de mensaje">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => {
                if (tab === t || !discardDraftsOk()) return
                setTab(t)
              }}
            >
              {t === 'todos' ? 'Todos' : SOURCE_LABEL[t]}
              <span className="segmented-count"> ({count(t)})</span>
            </button>
          ))}
        </div>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              if (!discardDraftsOk()) return
              setIncludeArchived(e.target.checked)
            }}
          />
          Mostrar archivados
        </label>
      </div>

      {page.loading && !page.data && <Loading />}
      {Boolean(page.error) && <LoadError error={page.error} onRetry={page.reload} />}

      {page.data && rows.length === 0 && (
        <p className="empty-state">{EMPTY[tab] ?? 'No hay mensajes para mostrar.'}</p>
      )}

      {rows.length > 0 && (
        <ul className="message-list">
          {rows.map((m) => (
            <li key={m.id} className={m.status === 'nuevo' ? 'message is-unread' : 'message'}>
              <button
                type="button"
                className="message-toggle"
                aria-expanded={openId === m.id}
                aria-controls={`mensaje-${m.id}`}
                onClick={() => void toggle(m)}
              >
                <MessageSummary m={m} />
              </button>
              {openId === m.id && (
                <div id={`mensaje-${m.id}`} className="message-detail">
                  <MessageDetail
                    m={m}
                    templates={templates.data ?? []}
                    draft={drafts[m.id]}
                    onDraft={(value) => setDrafts((d) => ({ ...d, [m.id]: value }))}
                    onSaved={(notes) => {
                      patch(m.id, { notes: notes || null })
                      setDrafts((d) => {
                        const next = { ...d }
                        delete next[m.id]
                        return next
                      })
                    }}
                    onConfirmed={(at) => patch(m.id, { confirmed_at: at })}
                    onStatus={async (status) => {
                      const archiving = status === 'archivado'
                      if (archiving && !showArchived && !discardDraftsOk([m.id])) return
                      if (!(await changeStatus(m, status))) return
                      toast.show(status === 'nuevo' ? 'Marcado como no leído.' : archiving ? 'Archivado.' : 'Desarchivado.')
                      if (archiving && !showArchived) setOpenId(null)
                    }}
                    onDelete={() => setDeleting(m)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar mensaje"
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        <p>
          Vas a eliminar el mensaje de <strong>{deleting ? fullName(deleting.name, deleting.last_name) : ''}</strong>. No se
          puede deshacer.
        </p>
        <p>La auditoría registra que se borró, sin guardar sus datos personales.</p>
      </ConfirmDialog>
    </section>
  )
}

function RequestBadge({ m }: { m: Message }) {
  const state = requestState(m.created_at, m.confirmed_at)
  return <span className={`request-state request-${state.kind}`}>{requestStateText(state)}</span>
}

function MessageSummary({ m }: { m: Message }) {
  const parts = [m.contact_hidden ? 'Contacto oculto' : (m.email ?? 'Sin email'), SOURCE_LABEL[m.source as Source] ?? m.source]
  if (isRequest(m.source)) parts.push(m.request_code ?? '')
  else if (m.motivo) parts.push(m.motivo)
  if (m.country) parts.push(m.country)
  return (
    <>
      <span className="message-dot" aria-hidden="true" />
      <span className="message-main">
        <span className="message-title">
          {fullName(m.name, m.last_name)} <span className={`status-tag status-${m.status}`}>{statusLabel(m.status)}</span>
        </span>
        <span className="message-sub">{parts.filter(Boolean).join(' · ')}</span>
        <span className="message-meta">
          {formatDateTime(m.created_at)}
          {isRequest(m.source) && (
            <>
              {' · '}
              <RequestBadge m={m} />
            </>
          )}
        </span>
      </span>
    </>
  )
}

type DetailProps = {
  m: Message
  templates: EmailTemplate[]
  draft: string | undefined
  onDraft: (value: string) => void
  onSaved: (notes: string) => void
  onConfirmed: (at: string) => void
  onStatus: (status: Status) => Promise<void>
  onDelete: () => void
}

function MessageDetail({ m, templates, draft, onDraft, onSaved, onConfirmed, onStatus, onDelete }: DetailProps) {
  const { access } = useMember()
  const toast = useToast()
  const [busy, setBusy] = useState<'notes' | 'confirm' | null>(null)
  const request = isRequest(m.source)
  const notes = draft ?? m.notes ?? ''
  const reply = request ? confirmationHref(m, templates) : replyHref(m)
  const whatsapp = whatsappHref(m.phone)

  async function saveNotes() {
    setBusy('notes')
    try {
      await saveMessageNotes(m.id, notes.trim())
      onSaved(notes.trim())
      toast.show('Nota guardada.')
    } catch (e) {
      toast.show(errorMessage(e, 'No se pudo guardar la nota. Probá de nuevo.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function confirm() {
    setBusy('confirm')
    try {
      const at = await confirmRequest(m.id)
      onConfirmed(at)
      toast.show('Pedido marcado como confirmado.')
    } catch (e) {
      toast.show(errorMessage(e, 'No se pudo marcar como confirmado. Probá de nuevo.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const data: [string, ReactNode][] = []
  if (request) data.push(['Código', <strong key="c">{m.request_code}</strong>])
  if (m.contact_hidden) data.push(['Contacto', <span key="e" className="text-muted">Oculto: tu rol no incluye ver email y teléfono.</span>])
  else {
    const href = mailHref(m.email)
    data.push([
      'Email',
      href ? (
        <a key="e" className="text-link" href={href}>
          {m.email}
        </a>
      ) : (
        <span key="e">
          {m.email ?? '—'} <span className="text-muted">(dirección inválida: revisala antes de escribir)</span>
        </span>
      ),
    ])
    if (m.phone) data.push(['Teléfono', m.phone])
  }
  if (m.country) data.push(['País', m.country])
  if (m.motivo) data.push([motivoLabel(m.source), m.motivo])
  if (!request) {
    data.push(['Privacidad', m.privacy_consent ? 'Marcó la casilla (consentimiento expreso)' : 'Sin casilla: llegó antes de que existiera'])
  }
  if (m.source === 'suscripcion') {
    data.push(['Mayor de 18', m.adult_confirmed ? 'Sí, lo declaró' : 'Sin declarar: llegó antes de que existiera la casilla'])
    data.push(['Publicar su nombre si gana', m.publish_consent ? 'Sí, lo autorizó' : 'No autorizado'])
  }
  data.push(['Llegó', formatDateTime(m.created_at)])
  if (request) data.push(['Plazo', <RequestBadge key="p" m={m} />])

  return (
    <div className="stack-md">
      <p className="message-text">{m.message || emptyMessageText(m.source)}</p>
      <dl className="data-list">
        {data.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {m.person_id && can(access, 'personas.ver') && (
        <p>
          <Link className="text-link" to={`/personas/${m.person_id}`}>
            Ver la ficha de la persona
          </Link>
        </p>
      )}

      {m.can_handle && (
        <div className="field">
          <label htmlFor={`notas-${m.id}`}>Notas internas</label>
          <textarea
            id={`notas-${m.id}`}
            maxLength={2000}
            rows={3}
            placeholder="Por ejemplo: le escribí por WhatsApp el martes."
            value={notes}
            onChange={(e) => onDraft(e.target.value)}
          />
          <div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void saveNotes()} disabled={busy !== null}>
              {busy === 'notes' ? 'Guardando…' : 'Guardar nota'}
            </button>
          </div>
        </div>
      )}
      {!m.can_handle && m.notes && (
        <div className="stack-sm">
          <p className="field-label">Notas internas</p>
          <p className="text-muted">{m.notes}</p>
        </div>
      )}

      {(m.can_handle || can(access, 'personas.borrar')) && (
        <div className="form-actions">
          {m.can_handle && reply && (
            <a className="btn btn-solid btn-sm" href={reply}>
              {request ? 'Enviar confirmación por email' : 'Responder por email'}
            </a>
          )}
          {m.can_handle && request && !m.confirmed_at && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void confirm()} disabled={busy !== null}>
              {busy === 'confirm' ? 'Guardando…' : 'Marcar como confirmado'}
            </button>
          )}
          {m.can_handle && whatsapp && (
            <a className="btn btn-outline btn-sm" href={whatsapp} target="_blank" rel="noopener noreferrer">
              Escribir por WhatsApp
            </a>
          )}
          {m.can_handle && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onStatus('nuevo')}>
                Marcar como no leído
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void onStatus(m.status === 'archivado' ? 'leido' : 'archivado')}
              >
                {m.status === 'archivado' ? 'Desarchivar' : 'Archivar'}
              </button>
            </>
          )}
          {can(access, 'personas.borrar') && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete}>
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
