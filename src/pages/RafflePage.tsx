import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMember } from '../auth/context'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { Modal } from '../components/Modal'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import {
  PICK_STATUS_LABEL,
  announceRaffle,
  closeRaffle,
  drawRaffle,
  drawnNumbers,
  fetchRaffles,
  notifyPick,
  prepareRaffle,
  resolvePick,
  type Raffle,
  type RaffleAnnouncement,
  type RafflePick,
} from '../lib/billing'
import { formatDay, toLocalInput } from '../lib/compliance'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { can } from '../lib/permissions'
import { useAsync } from '../lib/useAsync'

// Suma días a una fecha YYYY-MM-DD sin pasar por la zona horaria.
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Quién tiene que hacer algo con cada persona sorteada.
export function pickHint(p: Pick<RafflePick, 'status' | 'respond_by' | 'beca_until' | 'subscription_id'>, today: string): string {
  if (p.status === 'por_avisar') return 'Le toca el aviso por email.'
  if (p.status === 'en_espera') return 'Espera por si alguien no usa su beca.'
  if (p.status === 'avisada' && p.respond_by) {
    return p.respond_by >= today
      ? `Tiene hasta el ${formatDay(p.respond_by)} para responder.`
      : `Pasó el plazo para responder (${formatDay(p.respond_by)}).`
  }
  if (p.status === 'acepto') {
    if (p.subscription_id) return 'Ya contrató con la beca.'
    return p.beca_until ? `Tiene hasta el ${formatDay(p.beca_until)} para contratar con la beca.` : 'Aceptó la beca.'
  }
  return 'La beca pasó al suplente siguiente.'
}

export function RafflePage() {
  const page = useAsync(fetchRaffles)
  const [today] = useState(() => toLocalInput().slice(0, 10))
  const view = page.data
  const current = view?.raffles.find((r) => r.status !== 'cerrado') ?? null
  const past = view?.raffles.filter((r) => r.status === 'cerrado') ?? []

  return (
    <section className="stack-lg">
      <header className="stack-sm">
        <h1 className="h-xl" tabIndex={-1} data-page-title>
          Sorteo de becas
        </h1>
        <p className="text-muted measure">
          Las 3 becas del 50% para la lista de espera, según las Bases de los Términos. El CRM numera la lista por orden
          de inscripción, sortea con números al azar y guarda cada número que salió, también los repetidos.
        </p>
      </header>

      {page.loading && !view && <Loading />}
      {Boolean(page.error) && <LoadError error={page.error} onRetry={page.reload} />}

      {view && current?.status !== 'sorteado' && (
        <AnnounceSection
          key={view.announcement?.created_at ?? 'sin-aviso'}
          announcement={view.announcement}
          waitlist={view.waitlist_count}
          today={today}
          onDone={page.reload}
        />
      )}

      {view && !current && (
        <PrepareForm
          key={view.announcement?.raffle_date ?? today}
          announcedDate={view.announcement?.raffle_date ?? null}
          openedAt={view.opened_at}
          enrollmentsOpen={view.enrollments_open}
          waitlist={view.waitlist_count}
          today={today}
          onDone={page.reload}
        />
      )}
      {view && current && (
        <CurrentRaffle raffle={current} enrollmentsOpen={view.enrollments_open} today={today} onChanged={page.reload} />
      )}

      {past.length > 0 && (
        <section className="stack-md" aria-labelledby="sorteos-anteriores">
          <h2 className="h-md" id="sorteos-anteriores">
            Sorteos anteriores
          </h2>
          <ul className="plain-list">
            {past.map((r) => (
              <li key={r.id}>
                {r.drawn_at ? `Sorteado el ${formatDateTime(r.drawn_at)}` : 'Cerrado sin sortear'} · {r.entries_count}{' '}
                participantes · números {drawnNumbers(r).titulares.join(', ') || 'ninguno'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}

function AnnounceSection({
  announcement,
  waitlist,
  today,
  onDone,
}: {
  announcement: RaffleAnnouncement | null
  waitlist: number
  today: string
  onDone: () => Promise<void>
}) {
  const toast = useToast()
  const earliest = addDays(today, 7)
  const [date, setDate] = useState(earliest)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!date || date < earliest) {
      setError(`Las Bases piden avisar con al menos 7 días de anticipación: elegí el ${formatDay(earliest)} o una fecha posterior.`)
      return
    }
    setError(null)
    setConfirming(true)
  }

  return (
    <section className="panel stack-md" aria-labelledby="avisar-fecha">
      <h2 className="h-md" id="avisar-fecha">
        Avisar la fecha del sorteo
      </h2>
      {announcement ? (
        <p>
          Avisaste que el sorteo es el <strong>{formatDay(announcement.raffle_date)}</strong>. Quedaron{' '}
          {announcement.recipients === 1 ? '1 email' : `${announcement.recipients} emails`} en la cola y salieron{' '}
          {announcement.sent}. A quien se anote antes de la apertura también le llega.
        </p>
      ) : (
        <p>
          Las Bases piden avisar la fecha por email a toda la lista de espera, con al menos 7 días de anticipación. Hoy
          son <strong>{waitlist}</strong> {waitlist === 1 ? 'persona' : 'personas'}. A quien se anote después, hasta la
          apertura, le llega sola.
        </p>
      )}
      <p className="text-muted">
        Los emails salen por la cola de Emails. Publicá también la fecha en las Bases, desde Núcleo → Contenido del sitio →
        Términos.
      </p>
      <form className="inline-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="aviso-fecha">{announcement ? 'Cambiar la fecha' : 'Fecha del sorteo'}</label>
          <input id="aviso-fecha" type="date" min={earliest} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button type="submit" className={announcement ? 'btn btn-outline' : 'btn btn-solid'}>
          {announcement ? 'Avisar la fecha nueva' : 'Avisar a la lista'}
        </button>
      </form>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        title="Avisar la fecha del sorteo"
        confirmLabel="Mandar el aviso"
        onConfirm={async () => {
          try {
            const n = await announceRaffle(date)
            setConfirming(false)
            toast.show(n === 1 ? 'Quedó 1 aviso en la cola de Emails.' : `Quedaron ${n} avisos en la cola de Emails.`)
            await onDone()
          } catch (e) {
            setConfirming(false)
            setError(errorMessage(e, 'No pudimos mandar el aviso.'))
          }
        }}
        onClose={() => setConfirming(false)}
      >
        <p>
          Le escribimos a cada persona mayor de 18 de la lista de espera que el sorteo es el {formatDay(date)}.
          {announcement ? ' Es una fecha nueva: el aviso vuelve a salir para todas.' : ''}
        </p>
      </ConfirmDialog>
    </section>
  )
}

function PrepareForm({
  announcedDate,
  openedAt,
  enrollmentsOpen,
  waitlist,
  today,
  onDone,
}: {
  announcedDate: string | null
  openedAt: string | null
  enrollmentsOpen: boolean
  waitlist: number
  today: string
  onDone: () => Promise<void>
}) {
  const toast = useToast()
  const [date, setDate] = useState(announcedDate ?? today)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!date) return setError('Elegí la fecha del sorteo.')
    setError(null)
    setBusy(true)
    try {
      await prepareRaffle(date)
      toast.show('Numeraste la lista de espera.')
      await onDone()
    } catch (err) {
      setError(errorMessage(err, 'No pudimos numerar la lista.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel stack-md" aria-labelledby="preparar-sorteo">
      <h2 className="h-md" id="preparar-sorteo">
        Preparar el sorteo
      </h2>
      <p>
        Hay <strong>{waitlist}</strong> {waitlist === 1 ? 'persona mayor de 18 anotada' : 'personas mayores de 18 anotadas'}{' '}
        en la lista de espera.
      </p>
      {openedAt ? (
        <p className="text-muted">
          Las inscripciones se abrieron el {formatDateTime(openedAt)}: participan quienes se anotaron antes.
          {!enrollmentsOpen && ' Ahora están cerradas: para sortear tienen que estar abiertas.'}
        </p>
      ) : (
        <p className="text-muted">
          Las inscripciones todavía no se abrieron. La lista se numera después de la apertura, con quienes se anotaron
          antes.
        </p>
      )}
      <form className="inline-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="sorteo-fecha">Fecha del sorteo</label>
          <input id="sorteo-fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-solid" disabled={busy || !openedAt} aria-busy={busy}>
          {busy ? 'Numerando…' : 'Numerar la lista'}
        </button>
      </form>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function CurrentRaffle({
  raffle,
  enrollmentsOpen,
  today,
  onChanged,
}: {
  raffle: Raffle
  enrollmentsOpen: boolean
  today: string
  onChanged: () => Promise<void>
}) {
  const toast = useToast()
  const [drawing, setDrawing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [screen, setScreen] = useState(false)
  const numbers = drawnNumbers(raffle)
  const drawn = raffle.status === 'sorteado'

  return (
    <section className="stack-lg" aria-labelledby="sorteo-actual">
      <div className="panel stack-md">
        <div className="page-header">
          <h2 className="h-md" id="sorteo-actual">
            {drawn ? 'Sorteo hecho' : 'Sorteo preparado'}
            {raffle.scheduled_for ? ` · ${formatDay(raffle.scheduled_for)}` : ''}
          </h2>
          <div className="form-actions">
            {drawn && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setScreen(true)}>
                Pantalla para grabar
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setClosing(true)}>
              Cerrar el sorteo
            </button>
          </div>
        </div>
        <dl className="data-list">
          <div>
            <dt>Participantes</dt>
            <dd>
              {raffle.entries_count}, numeradas del 1 al {raffle.entries_count} por orden de inscripción
            </dd>
          </div>
          <div>
            <dt>Premio</dt>
            <dd>
              {raffle.winners} becas del {raffle.discount_percent}% y {raffle.substitutes} suplentes
            </dd>
          </div>
          <div>
            <dt>Huella de la lista</dt>
            <dd className="cell-sub">
              <code>{raffle.entries_digest}</code>
            </dd>
          </div>
          {raffle.drawn_at && (
            <div>
              <dt>Sorteado</dt>
              <dd>
                {formatDateTime(raffle.drawn_at)}
                {raffle.drawn_by_email ? ` por ${raffle.drawn_by_email}` : ''}
              </dd>
            </div>
          )}
        </dl>
        <p className="text-muted">
          La huella es un código que identifica la lista numerada. Si alguien la cambiara, el código sería otro: podés
          publicarla antes de sortear.
        </p>
        {!drawn && (
          <div className="stack-sm">
            {!enrollmentsOpen && (
              <p className="form-note form-note-error">
                Las Bases dicen que el sorteo se hace con las inscripciones abiertas. Abrilas desde Configuración.
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-solid"
                disabled={!enrollmentsOpen || raffle.entries_count === 0}
                onClick={() => setDrawing(true)}
              >
                Sortear
              </button>
            </div>
          </div>
        )}
      </div>

      {drawn && <Picks raffle={raffle} today={today} onChanged={onChanged} />}

      {raffle.draws.length > 0 && (
        <details className="disclosure">
          <summary>Cada número que salió ({raffle.draws.length})</summary>
          <ol className="plain-list">
            {raffle.draws.map((d) => (
              <li key={d.attempt}>
                Intento {d.attempt}: número {d.number}
                {d.repeated ? ' (repetido, se volvió a sortear)' : ''}
              </li>
            ))}
          </ol>
        </details>
      )}

      <ConfirmDialog
        open={drawing}
        title="Sortear"
        confirmLabel="Sortear ahora"
        onConfirm={async () => {
          try {
            await drawRaffle(raffle.id)
            setDrawing(false)
            setScreen(true)
            await onChanged()
          } catch (e) {
            toast.show(errorMessage(e, 'No pudimos sortear.'), 'error')
          }
        }}
        onClose={() => setDrawing(false)}
      >
        <p>
          Salen {raffle.winners} titulares y {raffle.substitutes} suplentes entre los {raffle.entries_count} números. No se
          puede repetir: si estás grabando, empezá la grabación antes de confirmar.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={closing}
        title="Cerrar el sorteo"
        confirmLabel="Cerrar el sorteo"
        onConfirm={async () => {
          try {
            await closeRaffle(raffle.id)
            setClosing(false)
            toast.show('Cerraste el sorteo.')
            await onChanged()
          } catch (e) {
            toast.show(errorMessage(e, 'No pudimos cerrar el sorteo.'), 'error')
          }
        }}
        onClose={() => setClosing(false)}
      >
        <p>
          {drawn
            ? 'Cerralo cuando las becas estén resueltas. Queda guardado en Sorteos anteriores.'
            : 'El sorteo no se hizo. Si lo cerrás, podés numerar la lista de nuevo.'}
        </p>
      </ConfirmDialog>

      <Modal open={screen} title="Números sorteados" onClose={() => setScreen(false)} wide>
        <div className="raffle-screen">
          <p className="raffle-screen-label">Becas</p>
          <ol className="raffle-numbers">
            {numbers.titulares.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ol>
          {numbers.suplentes.length > 0 && (
            <>
              <p className="raffle-screen-label">Suplentes, en orden</p>
              <ol className="raffle-numbers raffle-numbers-sub">
                {numbers.suplentes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ol>
            </>
          )}
          <p className="text-muted">Sobre {raffle.entries_count} participantes. Esta pantalla no muestra datos personales.</p>
        </div>
      </Modal>
    </section>
  )
}

function Picks({ raffle, today, onChanged }: { raffle: Raffle; today: string; onChanged: () => Promise<void> }) {
  const { access } = useMember()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [skipping, setSkipping] = useState<RafflePick | null>(null)
  const canRegister = can(access, 'suscripciones.gestionar') && can(access, 'personas.ver')

  async function run(pick: RafflePick, action: () => Promise<void>, done: string) {
    setBusy(pick.id)
    try {
      await action()
      toast.show(done)
      await onChanged()
    } catch (e) {
      toast.show(errorMessage(e, 'No pudimos guardar el cambio.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="stack-md" aria-labelledby="sorteo-personas">
      <h2 className="h-md" id="sorteo-personas">
        Personas sorteadas
      </h2>
      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">Personas sorteadas</caption>
          <thead>
            <tr>
              <th scope="col">Número</th>
              <th scope="col">Persona</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {raffle.picks.map((p) => {
              const late = p.status === 'avisada' && p.respond_by !== null && p.respond_by < today
              const disabled = busy === p.id
              return (
                <tr key={p.id}>
                  <td data-label="Número">
                    <span className="cell-strong">{p.number}</span>
                    <span className="cell-sub cell-nowrap">{p.role === 'titular' ? 'Titular' : `Suplente ${p.position - raffle.winners}`}</span>
                  </td>
                  <td data-label="Persona">
                    {p.person_id && p.name ? (
                      <Link className="cell-link" to={`/personas/${p.person_id}`}>
                        {p.name}
                      </Link>
                    ) : (
                      (p.name ?? 'Nombre oculto para tu rol')
                    )}
                    <span className="cell-sub">
                      {p.public_name ? `Se puede publicar como ${p.public_name}` : 'No autorizó publicar su nombre'}
                    </span>
                  </td>
                  <td data-label="Estado">
                    <span className={`status-tag${p.status === 'acepto' ? ' status-nuevo' : ''}`}>{PICK_STATUS_LABEL[p.status]}</span>
                    <span className="cell-sub">{pickHint(p, today)}</span>
                  </td>
                  <td>
                    <div className="form-actions">
                      {p.status === 'por_avisar' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-solid btn-sm"
                            disabled={disabled}
                            onClick={() => run(p, () => notifyPick(p.id), 'El aviso quedó en la cola de Emails.')}
                          >
                            Avisar por email
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={disabled}
                            onClick={() => setSkipping(p)}
                          >
                            No se la puede avisar
                          </button>
                        </>
                      )}
                      {p.status === 'avisada' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-solid btn-sm"
                            disabled={disabled}
                            onClick={() => run(p, () => resolvePick(p.id, 'acepto'), 'Registraste que aceptó la beca.')}
                          >
                            Aceptó
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={disabled}
                            onClick={() => run(p, () => resolvePick(p.id, 'rechazo'), 'La beca pasó al suplente siguiente.')}
                          >
                            No la quiere
                          </button>
                          {late && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={disabled}
                              onClick={() => run(p, () => resolvePick(p.id, 'sin_respuesta'), 'La beca pasó al suplente siguiente.')}
                            >
                              No respondió
                            </button>
                          )}
                        </>
                      )}
                      {p.status === 'acepto' && !p.subscription_id && canRegister && p.person_id && (
                        <Link className="btn btn-outline btn-sm" to={`/suscripciones?beca=${p.id}&persona=${p.person_id}`}>
                          Registrar el alta con beca
                        </Link>
                      )}
                      {p.subscription_id && can(access, 'suscripciones.ver') && (
                        <Link className="text-link" to={`/suscripciones?suscripcion=${p.subscription_id}`}>
                          Ver la suscripción
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={skipping !== null}
        title="Pasar la beca al suplente"
        confirmLabel="Pasar al suplente"
        danger
        onConfirm={async () => {
          if (!skipping) return
          await run(skipping, () => resolvePick(skipping.id, 'sin_respuesta'), 'La beca pasó al suplente siguiente.')
          setSkipping(null)
        }}
        onClose={() => setSkipping(null)}
      >
        <p>
          Usalo solo si no hay forma de avisarle al número {skipping?.number}, por ejemplo porque su email no es válido.
          La beca pasa al primer suplente y no se puede deshacer.
        </p>
      </ConfirmDialog>
    </section>
  )
}
