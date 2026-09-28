import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMember } from '../auth/context'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import {
  CHANNEL_LABEL,
  DATA_REQUEST_KINDS,
  DATA_REQUEST_KIND_HELP,
  DATA_REQUEST_KIND_LABEL,
  DATA_REQUEST_STATUS_LABEL,
  closeDataRequest,
  createDataRequest,
  dueText,
  dueTone,
  fetchDataRequests,
  formatDay,
  fromLocalInput,
  toLocalInput,
  updateDataRequest,
  yearsText,
  type DataRequest,
  type DataRequestChannel,
  type DataRequestKind,
} from '../lib/compliance'
import { fetchPeople, personName, type PersonSummary } from '../lib/crm'
import { errorMessage } from '../lib/errors'
import { formatDate, formatDateTime } from '../lib/format'
import { can } from '../lib/permissions'
import { useAsync } from '../lib/useAsync'
import { isValidEmail } from '../lib/validation'

type Tab = 'pendientes' | 'cerrados'

export function requesterLabel(r: Pick<DataRequest, 'person_name' | 'requester_name' | 'requester_email' | 'contact_hidden'>): string {
  return r.person_name ?? r.requester_name ?? (r.contact_hidden ? 'Sin nombre' : (r.requester_email ?? 'Sin nombre'))
}

export function DataRequestsPage() {
  const { access } = useMember()
  const [params, setParams] = useSearchParams()
  const openParam = params.get('pedido')
  const personParam = params.get('persona')
  const page = useAsync(fetchDataRequests)
  const [creating, setCreating] = useState(Boolean(personParam))
  const [openId, setOpenId] = useState<string | null>(openParam)
  const list = useMemo(() => page.data ?? [], [page.data])
  const opened = list.find((r) => r.id === openParam)
  // Sin elegir pestaña, se muestra la del pedido que llega en ?pedido=.
  const [tab, setTab] = useState<Tab | null>(null)
  const activeTab: Tab = tab ?? (opened && opened.status !== 'pendiente' ? 'cerrados' : 'pendientes')
  const rows = list.filter((r) => (activeTab === 'pendientes' ? r.status === 'pendiente' : r.status !== 'pendiente'))
  const pending = list.filter((r) => r.status === 'pendiente').length

  return (
    <section className="stack-lg">
      <header className="page-header">
        <div className="stack-sm">
          <h1 className="h-xl" tabIndex={-1} data-page-title>
            Pedidos de datos
          </h1>
          <p className="text-muted measure">
            Cuando alguien pide ver, corregir o borrar sus datos (Ley 25.326), registralo acá el mismo día que llega. El CRM
            calcula el plazo: 10 días corridos para el acceso y 5 días hábiles para corregir o borrar.
          </p>
        </div>
        {!creating && (
          <button type="button" className="btn btn-solid" onClick={() => setCreating(true)}>
            Registrar un pedido
          </button>
        )}
      </header>

      {creating && (
        <NewRequestForm
          initialPersonId={personParam}
          canPickPerson={can(access, 'personas.ver')}
          canWriteEmail={can(access, 'personas.ver_contacto')}
          onCancel={() => {
            setCreating(false)
            if (personParam) setParams({}, { replace: true })
          }}
          onCreated={async (id) => {
            setCreating(false)
            setTab('pendientes')
            setOpenId(id)
            setParams({ pedido: id }, { replace: true })
            await page.reload()
          }}
        />
      )}

      <div className="segmented" role="group" aria-label="Estado del pedido">
        <button type="button" aria-pressed={activeTab === 'pendientes'} onClick={() => setTab('pendientes')}>
          Pendientes<span className="segmented-count"> ({pending})</span>
        </button>
        <button type="button" aria-pressed={activeTab === 'cerrados'} onClick={() => setTab('cerrados')}>
          Cerrados<span className="segmented-count"> ({list.length - pending})</span>
        </button>
      </div>

      {page.loading && !page.data && <Loading />}
      {Boolean(page.error) && <LoadError error={page.error} onRetry={page.reload} />}
      {page.data && rows.length === 0 && (
        <p className="empty-state">
          {activeTab === 'pendientes' ? 'No hay pedidos pendientes.' : 'Todavía no hay pedidos cerrados.'}
        </p>
      )}

      {rows.length > 0 && (
        <ul className="message-list">
          {rows.map((r) => (
            <li key={r.id} className="message">
              <button
                type="button"
                className="message-toggle"
                aria-expanded={openId === r.id}
                aria-controls={`pedido-${r.id}`}
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
              >
                <span className="message-main">
                  <span className="message-title">
                    {requesterLabel(r)}{' '}
                    <span className={`status-tag${r.status === 'pendiente' ? ' status-nuevo' : ''}`}>
                      {DATA_REQUEST_STATUS_LABEL[r.status]}
                    </span>
                  </span>
                  <span className="message-sub">
                    {DATA_REQUEST_KIND_LABEL[r.kind]} · {r.code} · llegó el {formatDateTime(r.received_at)}
                  </span>
                  <span className="message-meta">
                    {r.status === 'pendiente' && r.days_left !== null ? (
                      <span className={`due due-${dueTone(r.days_left)}`}>
                        {dueText(r.days_left)} ({formatDay(r.due_date)})
                      </span>
                    ) : (
                      <ClosedText r={r} />
                    )}
                  </span>
                </span>
              </button>
              {openId === r.id && (
                <div id={`pedido-${r.id}`} className="message-detail">
                  <RequestDetail r={r} onChanged={page.reload} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ClosedText({ r }: { r: DataRequest }) {
  if (r.status === 'anulado') return <>Anulado el {formatDateTime(r.resolved_at)}</>
  return (
    <>
      Respondido el {formatDateTime(r.resolved_at)}
      {r.resolved_on_time === false && <span className="due due-late"> · fuera de plazo</span>}
    </>
  )
}

const NEXT_STEP: Record<DataRequestKind, string> = {
  acceso:
    'Descargá sus datos desde la ficha con "Descargar sus datos" y mandáselos por email. Después marcá el pedido como respondido.',
  rectificacion: 'Corregí los datos en la ficha con "Editar datos" y avisale por email. Después marcá el pedido como respondido.',
  supresion:
    'Borrá a la persona desde su ficha y avisale por email que ya no tenemos sus datos. El pedido queda acá como constancia, sin la ficha.',
}

function RequestDetail({ r, onChanged }: { r: DataRequest; onChanged: () => Promise<void> }) {
  const { access } = useMember()
  const toast = useToast()
  const [verified, setVerified] = useState(r.identity_verified)
  const [detail, setDetail] = useState(r.detail ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'save' | 'respondido' | 'anulado' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = r.status === 'pendiente'
  const dirty = verified !== r.identity_verified || detail.trim() !== (r.detail ?? '')

  async function save() {
    setBusy('save')
    try {
      await updateDataRequest(r.id, verified, detail)
      toast.show('Guardaste los cambios del pedido.')
      await onChanged()
    } catch (e) {
      toast.show(errorMessage(e, 'No pudimos guardar los cambios.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function close(status: 'respondido' | 'anulado') {
    if (status === 'anulado' && !note.trim()) {
      setError('Contá por qué se anula el pedido.')
      return
    }
    if (status === 'respondido' && dirty) {
      setError('Guardá los cambios del pedido antes de cerrarlo.')
      return
    }
    setError(null)
    setBusy(status)
    try {
      await closeDataRequest(r.id, status, note)
      toast.show(status === 'respondido' ? 'Marcaste el pedido como respondido.' : 'Anulaste el pedido.')
      await onChanged()
    } catch (e) {
      setError(errorMessage(e, 'No pudimos cerrar el pedido.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack-md">
      {r.missing_holiday_years.length > 0 && (
        <p className="form-note">
          Faltan cargar los feriados de {yearsText(r.missing_holiday_years)}. Si hay un feriado en el medio, el plazo real
          es más largo que el que ves: respondé antes para no correr riesgos.
        </p>
      )}
      {r.previous_access_at && (
        <p className="form-note">
          Ya respondimos un pedido de acceso de esta persona el {formatDate(r.previous_access_at)}, hace menos de seis
          meses. La ley garantiza el acceso gratuito cada seis meses, salvo interés legítimo (art. 14, inc. 3). Consultalo
          con la propietaria antes de responder.
        </p>
      )}

      <dl className="data-list">
        <div>
          <dt>Tipo</dt>
          <dd>{DATA_REQUEST_KIND_HELP[r.kind]}</dd>
        </div>
        <div>
          <dt>Quién</dt>
          <dd>
            {requesterLabel(r)}
            {!r.contact_hidden && r.requester_email && requesterLabel(r) !== r.requester_email ? ` · ${r.requester_email}` : ''}
          </dd>
        </div>
        <div>
          <dt>Llegó por</dt>
          <dd>
            {CHANNEL_LABEL[r.channel]} · {formatDateTime(r.received_at)}
          </dd>
        </div>
        <div>
          <dt>Vence</dt>
          <dd>{formatDay(r.due_date)}</dd>
        </div>
        <div>
          <dt>Lo registró</dt>
          <dd>{r.created_by_email ?? '—'}</dd>
        </div>
        {!open && (
          <div>
            <dt>{r.status === 'anulado' ? 'Motivo' : 'Respuesta'}</dt>
            <dd>{r.resolution_note ?? '—'}</dd>
          </div>
        )}
      </dl>

      {r.person_id && can(access, 'personas.ver') ? (
        <p>
          <Link className="text-link" to={`/personas/${r.person_id}`}>
            Abrir la ficha de {r.person_name ?? 'la persona'}
          </Link>
        </p>
      ) : (
        <p className="text-muted">
          {open
            ? 'No está asociado a una ficha. Si la persona no está en el CRM, respondele que no guardamos datos suyos.'
            : 'Sin ficha asociada.'}
        </p>
      )}

      {open && (
        <>
          <p className="panel">{NEXT_STEP[r.kind]}</p>
          <label className="check-inline">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
            Verificamos que el pedido lo hizo la persona titular de los datos
          </label>
          <div className="field">
            <label htmlFor={`detalle-${r.id}`}>Qué pidió</label>
            <textarea
              id={`detalle-${r.id}`}
              rows={3}
              maxLength={5000}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </div>
          <div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void save()} disabled={!dirty || busy !== null}>
              {busy === 'save' ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
          <div className="field">
            <label htmlFor={`cierre-${r.id}`}>Nota de cierre</label>
            <textarea
              id={`cierre-${r.id}`}
              rows={2}
              maxLength={5000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={`cierre-ayuda-${r.id}`}
              placeholder="Por ejemplo: le mandamos el archivo con sus datos el 3/10."
            />
            <p id={`cierre-ayuda-${r.id}`} className="field-help">
              Opcional para responder. Obligatoria para anular.
            </p>
          </div>
          {error && (
            <p className="form-note form-note-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-solid" onClick={() => void close('respondido')} disabled={busy !== null}>
              {busy === 'respondido' ? 'Guardando…' : 'Marcar como respondido'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void close('anulado')} disabled={busy !== null}>
              {busy === 'anulado' ? 'Guardando…' : 'Anular'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

type FormProps = {
  initialPersonId: string | null
  canPickPerson: boolean
  canWriteEmail: boolean
  onCancel: () => void
  onCreated: (id: string) => Promise<void>
}

function NewRequestForm({ initialPersonId, canPickPerson, canWriteEmail, onCancel, onCreated }: FormProps) {
  const toast = useToast()
  const people = useAsync(() => (canPickPerson ? fetchPeople() : Promise.resolve([] as PersonSummary[])))
  const [kind, setKind] = useState<DataRequestKind>('acceso')
  const [receivedAt, setReceivedAt] = useState(() => toLocalInput())
  const [channel, setChannel] = useState<DataRequestChannel>('email')
  const [personId, setPersonId] = useState(initialPersonId ?? '')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sortedPeople = useMemo(
    () => [...(people.data ?? [])].sort((a, b) => personName(a).localeCompare(personName(b), 'es')),
    [people.data],
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const iso = fromLocalInput(receivedAt)
    if (!iso) {
      setError('Revisá la fecha y la hora en que llegó el pedido.')
      return
    }
    if (!personId && !name.trim() && !email.trim()) {
      setError('Elegí a la persona o escribí su nombre o email.')
      return
    }
    if (!personId && email.trim() && !isValidEmail(email)) {
      setError('Revisá el email: tiene que ser una dirección válida, sin espacios.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const created = await createDataRequest({
        kind,
        receivedAt: iso,
        personId: personId || null,
        requesterName: personId ? undefined : name.trim(),
        requesterEmail: personId ? undefined : email.trim(),
        channel,
        detail: detail.trim(),
      })
      toast.show(`Registraste el pedido ${created.code}. Vence el ${formatDay(created.due_date)}.`)
      await onCreated(created.id)
    } catch (err) {
      setError(errorMessage(err, 'No pudimos registrar el pedido.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel stack-md" onSubmit={handleSubmit} noValidate>
      <h2 className="h-md">Registrar un pedido</h2>

      <fieldset className="field">
        <legend className="field-label">Qué pide</legend>
        {DATA_REQUEST_KINDS.map((k) => (
          <label key={k} className="choice">
            <input type="radio" name="tipo" value={k} checked={kind === k} onChange={() => setKind(k)} />
            <span>
              <strong>{DATA_REQUEST_KIND_LABEL[k]}.</strong> <span className="text-muted">{DATA_REQUEST_KIND_HELP[k]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="field-row">
        <div className="field">
          <label htmlFor="dr-recibido">Cuándo llegó (hora de Buenos Aires)</label>
          <input
            id="dr-recibido"
            type="datetime-local"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="dr-canal">Por dónde llegó</label>
          <select id="dr-canal" value={channel} onChange={(e) => setChannel(e.target.value as DataRequestChannel)}>
            {(Object.keys(CHANNEL_LABEL) as DataRequestChannel[]).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canPickPerson && (
        <div className="field">
          <label htmlFor="dr-persona">Persona</label>
          <select
            id="dr-persona"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            disabled={people.loading && !people.data}
          >
            <option value="">No está en el CRM</option>
            {sortedPeople.map((p) => (
              <option key={p.id} value={p.id}>
                {personName(p)}
                {p.email ? ` · ${p.email}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {!personId && (
        <div className="field-row">
          <div className="field">
            <label htmlFor="dr-nombre">Nombre</label>
            <input id="dr-nombre" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>
          {canWriteEmail && (
            <div className="field">
              <label htmlFor="dr-email">Email</label>
              <input id="dr-email" type="email" value={email} maxLength={320} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="dr-detalle">Qué pidió</label>
        <textarea
          id="dr-detalle"
          rows={3}
          maxLength={5000}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Copiá lo esencial del mensaje. No pegues documentos ni datos de tarjetas."
        />
      </div>

      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-solid" disabled={busy} aria-busy={busy}>
          {busy ? 'Registrando…' : 'Registrar pedido'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
