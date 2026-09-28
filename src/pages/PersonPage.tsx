import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMember } from '../auth/context'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import {
  CONSENT_LABEL,
  DATA_REQUEST_KIND_LABEL,
  DATA_REQUEST_STATUS_LABEL,
  currentConsents,
  formatDay,
  withdrawPublishConsent,
  type Consent,
} from '../lib/compliance'
import { downloadFile, todayStamp } from '../lib/csv'
import {
  addPersonNote,
  deletePerson,
  fetchPerson,
  logExport,
  notifyMessagesChanged,
  parseTags,
  personName,
  updatePerson,
  type PersonDataRequest,
  type PersonDetail,
  type PersonMessage,
  type PersonNote,
} from '../lib/crm'
import {
  EMAIL_KIND_LABEL,
  EMAIL_STATUS_LABEL,
  composeEmail,
  sendNow,
  sendResultText,
  type PersonEmail,
} from '../lib/emails'
import { errorMessage } from '../lib/errors'
import { personDataPackage } from '../lib/exports'
import { formatDate, formatDateTime, plural } from '../lib/format'
import {
  emptyMessageText,
  isRequest,
  motivoLabel,
  requestState,
  requestStateText,
  sourceLabel,
  statusLabel,
} from '../lib/messages'
import { can } from '../lib/permissions'
import { useAsync } from '../lib/useAsync'
import { isValidEmail } from '../lib/validation'

type TimelineItem =
  | { kind: 'mensaje'; at: string; message: PersonMessage }
  | { kind: 'nota'; at: string; note: PersonNote }
  | { kind: 'email'; at: string; email: PersonEmail }

export function buildTimeline(detail: Pick<PersonDetail, 'messages' | 'notes'> & { emails?: PersonEmail[] }): TimelineItem[] {
  const items: TimelineItem[] = [
    ...detail.messages.map((message) => ({ kind: 'mensaje' as const, at: message.created_at, message })),
    ...detail.notes.map((note) => ({ kind: 'nota' as const, at: note.created_at, note })),
    ...(detail.emails ?? []).map((email) => ({ kind: 'email' as const, at: email.sent_at ?? email.created_at, email })),
  ]
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

// Cómo se ve cada constancia: si está vigente, desde cuándo y por qué vía.
export function consentText(c: Consent): string {
  const when = formatDate(c.recorded_at)
  if (c.granted) return c.source === 'equipo' ? `Sí, registrado por el equipo el ${when}` : `Sí, desde el ${when} (${sourceLabel(c.source)})`
  return `Retirado el ${when}`
}

// Cada persona monta su propia pantalla: al pasar de una ficha a otra no quedan datos viejos.
export function PersonRoute() {
  const { id = '' } = useParams()
  return <PersonPage key={id} id={id} />
}

export function PersonPage({ id }: { id: string }) {
  const { access } = useMember()
  const toast = useToast()
  const navigate = useNavigate()
  const page = useAsync(() => fetchPerson(id))
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [composing, setComposing] = useState(false)

  if (page.loading && !page.data) return <Loading />
  if (page.error || !page.data) {
    return (
      <section className="stack-md">
        <h1 className="h-lg" tabIndex={-1} data-page-title>
          No pudimos abrir la ficha
        </h1>
        <LoadError error={page.error} onRetry={page.reload} />
        <Link className="text-link" to="/personas">
          Volver a Personas
        </Link>
      </section>
    )
  }

  const detail = page.data
  const p = detail.person
  const timeline = buildTimeline(detail)
  const consents = currentConsents(detail.consents)

  function downloadPackage() {
    downloadFile(`ava-datos-${todayStamp()}.json`, personDataPackage(detail), 'application/json;charset=utf-8')
    void logExport('exportar_persona', 'crm_people', { mensajes: detail.messages.length }, p.id)
  }

  async function confirmWithdraw() {
    try {
      await withdrawPublishConsent(p.id)
      setWithdrawing(false)
      toast.show('Retiraste la autorización para publicar su nombre.')
      await page.reload()
    } catch (e) {
      toast.show(errorMessage(e, 'No pudimos retirar la autorización.'), 'error')
    }
  }

  async function confirmDelete() {
    try {
      await deletePerson(p.id)
      notifyMessagesChanged()
      toast.show('Borraste a la persona y todos sus mensajes.')
      navigate('/personas', { replace: true })
    } catch (e) {
      toast.show(errorMessage(e, 'No pudimos borrar a la persona.'), 'error')
    }
  }

  return (
    <section className="stack-lg">
      <p>
        <Link className="text-link" to="/personas">
          ← Personas
        </Link>
      </p>

      <header className="page-header">
        <div className="stack-sm">
          <h1 className="h-xl" tabIndex={-1} data-page-title>
            {personName(p)}
          </h1>
          <p className="text-muted">
            {p.contact_hidden
              ? 'Contacto oculto: tu rol no incluye ver email y teléfono.'
              : [p.email, p.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
          </p>
          {p.tags.length > 0 && (
            <p className="tag-list">
              {p.tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="form-actions">
          {can(access, 'mensajes.responder') && !composing && (
            <button type="button" className="btn btn-solid" onClick={() => setComposing(true)}>
              Escribir un email
            </button>
          )}
          {can(access, 'personas.editar') && !editing && (
            <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
              Editar datos
            </button>
          )}
          {can(access, 'personas.exportar') && (
            <button type="button" className="btn btn-ghost" onClick={downloadPackage}>
              Descargar sus datos
            </button>
          )}
        </div>
      </header>

      {composing && (
        <ComposeForm
          personId={p.id}
          name={personName(p)}
          onCancel={() => setComposing(false)}
          onQueued={async () => {
            setComposing(false)
            await page.reload()
          }}
        />
      )}

      {editing && (
        <PersonForm
          detail={detail}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false)
            toast.show('Guardaste los cambios.')
            await page.reload()
          }}
        />
      )}

      <div className="person-grid">
        <section className="stack-md" aria-labelledby="historial">
          <h2 id="historial" className="h-md">
            Historial
          </h2>
          {can(access, 'personas.editar') && <NoteForm personId={p.id} onAdded={page.reload} />}
          {detail.hidden_messages > 0 && (
            <p className="form-note">
              {detail.hidden_messages === 1
                ? 'Hay 1 pedido de arrepentimiento o baja que tu rol no puede ver.'
                : `Hay ${detail.hidden_messages} pedidos de arrepentimiento o baja que tu rol no puede ver.`}
            </p>
          )}
          {timeline.length === 0 ? (
            <p className="text-muted">Todavía no hay nada en el historial.</p>
          ) : (
            <ol className="timeline">
              {timeline.map((item) =>
                item.kind === 'mensaje' ? (
                  <TimelineMessage key={`m-${item.message.id}`} m={item.message} />
                ) : item.kind === 'email' ? (
                  <TimelineEmail key={`e-${item.email.id}`} e={item.email} />
                ) : (
                  <li key={`n-${item.note.id}`} className="timeline-item timeline-note">
                    <p className="timeline-head">
                      <strong>Nota interna</strong>
                      <span className="text-muted">
                        {' · '}
                        {formatDateTime(item.note.created_at)}
                        {item.note.author_email ? ` · ${item.note.author_email}` : ''}
                      </span>
                    </p>
                    <p className="timeline-body">{item.note.body}</p>
                  </li>
                ),
              )}
            </ol>
          )}
        </section>

        <aside className="stack-md" aria-labelledby="datos">
          <h2 id="datos" className="h-md">
            Datos
          </h2>
          <dl className="data-list data-list-stacked">
            <div>
              <dt>País</dt>
              <dd>{p.country ?? '—'}</dd>
            </div>
            <div>
              <dt>Primera vez</dt>
              <dd>{formatDateTime(p.created_at)}</dd>
            </div>
            <div>
              <dt>Última actividad</dt>
              <dd>{formatDateTime(p.last_activity_at)}</dd>
            </div>
          </dl>

          <section className="stack-sm" aria-labelledby="consentimientos">
            <h3 id="consentimientos" className="h-sm">
              Consentimientos
            </h3>
            {consents.length === 0 ? (
              <p className="text-muted">
                Sin constancias. Los pedidos de arrepentimiento y baja no llevan casilla: se guardan por obligación legal.
              </p>
            ) : (
              <dl className="data-list data-list-stacked">
                {consents.map((c) => (
                  <div key={c.kind}>
                    <dt>{CONSENT_LABEL[c.kind]}</dt>
                    <dd>
                      {consentText(c)}
                      {c.kind === 'publicar_nombre' && c.granted && can(access, 'personas.editar') && (
                        <>
                          {' '}
                          <button type="button" className="link-btn" onClick={() => setWithdrawing(true)}>
                            Retirar
                          </button>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {detail.consents.length > consents.length && (
              <details className="disclosure">
                <summary>Ver todas las constancias ({detail.consents.length})</summary>
                <ul className="plain-list">
                  {detail.consents.map((c) => (
                    <li key={c.id}>
                      {CONSENT_LABEL[c.kind]}: {c.granted ? 'otorgado' : 'retirado'} el {formatDateTime(c.recorded_at)}
                      {c.recorded_by_email ? ` por ${c.recorded_by_email}` : ` (${sourceLabel(c.source)})`}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {detail.data_requests && (
            <PersonDataRequests personId={p.id} requests={detail.data_requests} />
          )}

          {can(access, 'personas.borrar') && (
            <div className="panel panel-danger stack-sm">
              <h3 className="h-md">Borrar a esta persona</h3>
              <p className="text-muted">
                Borra la ficha, sus mensajes, sus notas y sus emails. Usalo cuando la persona pide que borren sus datos o cuando vence
                el plazo de guarda.
              </p>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setDeleting(true)}>
                Borrar a {personName(p)}
              </button>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={withdrawing}
        title="Retirar la autorización"
        confirmLabel="Retirar autorización"
        onConfirm={confirmWithdraw}
        onClose={() => setWithdrawing(false)}
      >
        <p>
          <strong>{personName(p)}</strong> deja de autorizar que publiquemos su nombre si gana una beca. Queda una constancia
          con la fecha y quién lo registró.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting}
        title="Borrar a esta persona"
        confirmLabel="Borrar todo"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleting(false)}
      >
        <p>
          Vas a borrar a <strong>{personName(p)}</strong> con{' '}
          {plural(detail.messages.length + detail.hidden_messages, 'mensaje', 'mensajes')},{' '}
          {plural(detail.notes.length, 'nota', 'notas')} y {plural(detail.emails.length, 'email', 'emails')}. No se puede
          deshacer.
        </p>
        <p>La auditoría registra el borrado con la fecha y quién lo hizo, sin guardar sus datos personales.</p>
      </ConfirmDialog>
    </section>
  )
}

function TimelineMessage({ m }: { m: PersonMessage }) {
  const request = isRequest(m.source)
  return (
    <li className="timeline-item">
      <p className="timeline-head">
        <strong>{sourceLabel(m.source)}</strong>
        <span className="text-muted">
          {' · '}
          {formatDateTime(m.created_at)} · {statusLabel(m.status)}
        </span>
      </p>
      {request && (
        <p className="timeline-meta">
          Código <strong>{m.request_code}</strong> · {requestStateText(requestState(m.created_at, m.confirmed_at))}
        </p>
      )}
      {m.motivo && (
        <p className="timeline-meta">
          {motivoLabel(m.source)}: {m.motivo}
        </p>
      )}
      <p className="timeline-body">{m.message || emptyMessageText(m.source)}</p>
      {m.expires_at && <p className="timeline-meta text-muted">Se guarda hasta el {formatDate(m.expires_at)}</p>}
      <p>
        <Link className="text-link" to={`/mensajes?mensaje=${m.id}`}>
          Abrir en Mensajes
        </Link>
      </p>
    </li>
  )
}

function TimelineEmail({ e }: { e: PersonEmail }) {
  const when = e.sent_at
    ? `salió el ${formatDateTime(e.sent_at)}`
    : `${EMAIL_STATUS_LABEL[e.status].toLowerCase()} · ${formatDateTime(e.created_at)}`
  return (
    <li className="timeline-item timeline-email">
      <p className="timeline-head">
        <strong>Email: {e.subject}</strong>
        <span className="text-muted">
          {' · '}
          {when}
        </span>
      </p>
      <p className="timeline-meta">
        {EMAIL_KIND_LABEL[e.kind]}
        {e.created_by_email ? ` · ${e.created_by_email}` : ''}
        {e.status === 'fallido' && e.last_error ? ` · ${e.last_error}` : ''}
        {e.status === 'cancelado' && e.cancel_reason ? ` · ${e.cancel_reason}` : ''}
      </p>
      <details className="disclosure">
        <summary>Ver el texto</summary>
        <p className="timeline-body">{e.body}</p>
      </details>
      <p>
        <Link className="text-link" to={`/emails?email=${e.id}`}>
          Abrir en Emails
        </Link>
      </p>
    </li>
  )
}

function ComposeForm({
  personId,
  name,
  onCancel,
  onQueued,
}: {
  personId: string
  name: string
  onCancel: () => void
  onQueued: () => Promise<void>
}) {
  const toast = useToast()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) {
      setError('Escribí el asunto y el texto del email.')
      return
    }
    setError(null)
    setBusy(true)
    let id: string
    try {
      id = await composeEmail(personId, subject.trim(), body.trim())
    } catch (err) {
      setError(errorMessage(err, 'No pudimos guardar el email.'))
      setBusy(false)
      return
    }
    // El email ya quedó guardado: si el envío falla, sigue en la cola.
    try {
      toast.show(sendResultText(await sendNow([id])))
    } catch {
      toast.show('Guardamos el email, pero no pudimos mandarlo ahora. Sale solo en unos minutos.', 'error')
    }
    setBusy(false)
    await onQueued()
  }

  return (
    <form className="panel stack-md" onSubmit={handleSubmit} noValidate aria-labelledby="escribir-email">
      <h2 id="escribir-email" className="h-md">
        Email para {name}
      </h2>
      <p className="text-muted">
        Sale desde el remitente del CRM y queda en el historial. No hace falta que veas su email: el CRM lo completa.
      </p>
      <div className="field">
        <label htmlFor="email-asunto">Asunto</label>
        <input id="email-asunto" value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="email-texto">Texto</label>
        <textarea id="email-texto" rows={8} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-solid" disabled={busy} aria-busy={busy}>
          {busy ? 'Enviando…' : 'Enviar'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function NoteForm({ personId, onAdded }: { personId: string; onAdded: () => Promise<void> }) {
  const toast = useToast()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    try {
      await addPersonNote(personId, body.trim())
      setBody('')
      toast.show('Nota agregada.')
      await onAdded()
    } catch (err) {
      toast.show(errorMessage(err, 'No pudimos guardar la nota.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="field" onSubmit={handleSubmit}>
      <label htmlFor="nota-persona">Agregar una nota interna</label>
      <textarea
        id="nota-persona"
        rows={3}
        maxLength={5000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Por ejemplo: le conté cómo funcionan las becas por WhatsApp."
      />
      <div>
        <button type="submit" className="btn btn-outline btn-sm" disabled={busy || !body.trim()}>
          {busy ? 'Guardando…' : 'Agregar nota'}
        </button>
      </div>
    </form>
  )
}

function PersonForm({ detail, onCancel, onSaved }: { detail: PersonDetail; onCancel: () => void; onSaved: () => Promise<void> }) {
  const p = detail.person
  const [firstName, setFirstName] = useState(p.first_name ?? '')
  const [lastName, setLastName] = useState(p.last_name ?? '')
  const [country, setCountry] = useState(p.country ?? '')
  const [tags, setTags] = useState(p.tags.join(', '))
  const [email, setEmail] = useState(p.email ?? '')
  const [phone, setPhone] = useState(p.phone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!p.contact_hidden && email.trim() && !isValidEmail(email)) {
      setError('Revisá el email: tiene que ser una dirección válida, sin espacios.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await updatePerson(p.id, {
        first_name: firstName,
        last_name: lastName,
        country,
        tags: parseTags(tags),
        ...(p.contact_hidden ? {} : { email, phone }),
      })
      await onSaved()
    } catch (err) {
      setError(
        (err as { code?: string }).code === '23505'
          ? 'Ya hay otra persona con ese email.'
          : errorMessage(err, 'No pudimos guardar los cambios.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel stack-md" onSubmit={handleSubmit} noValidate>
      <h2 className="h-md">Editar datos</h2>
      <div className="field-row">
        <div className="field">
          <label htmlFor="p-nombre">Nombre</label>
          <input id="p-nombre" value={firstName} maxLength={200} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="p-apellido">Apellido</label>
          <input id="p-apellido" value={lastName} maxLength={200} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      {!p.contact_hidden && (
        <div className="field-row">
          <div className="field">
            <label htmlFor="p-email">Email</label>
            <input id="p-email" type="email" value={email} maxLength={320} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="p-telefono">Teléfono</label>
            <input id="p-telefono" type="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label htmlFor="p-pais">País</label>
          <input id="p-pais" value={country} maxLength={100} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="p-etiquetas">Etiquetas</label>
          <input
            id="p-etiquetas"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            aria-describedby="p-etiquetas-ayuda"
            placeholder="beca, empresa, seguimiento"
          />
          <p id="p-etiquetas-ayuda" className="field-help">
            Separalas con comas. Hasta 20.
          </p>
        </div>
      </div>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-solid" disabled={busy} aria-busy={busy}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function PersonDataRequests({ personId, requests }: { personId: string; requests: PersonDataRequest[] }) {
  return (
    <section className="stack-sm" aria-labelledby="pedidos-datos">
      <h3 id="pedidos-datos" className="h-sm">
        Pedidos de datos
      </h3>
      {requests.length === 0 ? (
        <p className="text-muted">No pidió acceso, corrección ni borrado de sus datos.</p>
      ) : (
        <ul className="plain-list">
          {requests.map((r) => (
            <li key={r.id}>
              <Link className="text-link" to={`/pedidos-de-datos?pedido=${r.id}`}>
                {r.code}
              </Link>{' '}
              · {DATA_REQUEST_KIND_LABEL[r.kind]} · {DATA_REQUEST_STATUS_LABEL[r.status]}
              {r.status === 'pendiente' ? ` · vence el ${formatDay(r.due_date)}` : ''}
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link className="text-link" to={`/pedidos-de-datos?persona=${personId}`}>
          Registrar un pedido
        </Link>
      </p>
    </section>
  )
}
