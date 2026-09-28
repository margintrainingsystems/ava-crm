import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import {
  FX_CHECK_TEXT,
  fetchEnrollment,
  fetchFx,
  fetchPublicPrices,
  formatMoney,
  parseArsNumber,
  saveEnrollment,
  setFxManual,
  type Enrollment,
  type FxStatus,
} from '../lib/billing'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'

// Inscripciones y cupo: lo que el sitio usa para mostrar el pago o la lista de espera.
export function EnrollmentSection() {
  const page = useAsync(fetchEnrollment)
  return (
    <section className="panel stack-md" aria-labelledby="inscripciones">
      <h2 id="inscripciones" className="h-md">
        Inscripciones y cupo
      </h2>
      {page.loading && !page.data && <Loading />}
      {Boolean(page.error) && <LoadError error={page.error} onRetry={page.reload} />}
      {page.data && (
        <EnrollmentForm
          key={`${page.data.enrollments_open}-${page.data.capacity}-${page.data.updated_at}`}
          enrollment={page.data}
          onSaved={page.reload}
        />
      )}
    </section>
  )
}

function EnrollmentForm({ enrollment, onSaved }: { enrollment: Enrollment; onSaved: () => Promise<void> }) {
  const toast = useToast()
  const [capacity, setCapacity] = useState(String(enrollment.capacity))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toggling, setToggling] = useState(false)
  const full = enrollment.active_plans >= enrollment.capacity

  async function save(open: boolean, value: number) {
    setBusy(true)
    try {
      await saveEnrollment(open, value)
      await onSaved()
      return true
    } catch (e) {
      setError(errorMessage(e, 'No pudimos guardar el cambio.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleCapacity(e: FormEvent) {
    e.preventDefault()
    const value = Number(capacity)
    if (!Number.isInteger(value) || value < 1) {
      setError('El cupo tiene que ser un número entero, de 1 en adelante.')
      return
    }
    setError(null)
    if (await save(enrollment.enrollments_open, value)) toast.show('Guardaste el cupo.')
  }

  return (
    <>
      <p>
        <strong>
          {enrollment.enrollments_open ? 'Las inscripciones están abiertas.' : 'Las inscripciones están cerradas.'}
        </strong>{' '}
        {enrollment.enrollments_open
          ? full
            ? 'El cupo está completo: el sitio muestra la lista de espera en lugar del pago.'
            : 'El sitio muestra el pago mientras quede lugar.'
          : 'El sitio muestra la lista de espera.'}
      </p>
      <p className="text-muted">
        {enrollment.active_plans} de {enrollment.capacity} lugares ocupados. Cuentan solo las suscripciones anuales activas
        o dadas de baja que todavía no terminaron; los Másteres sueltos no ocupan cupo. El sitio no muestra el número.
        {enrollment.opened_at ? ` Primera apertura: ${formatDateTime(enrollment.opened_at)}.` : ''}
      </p>
      <form className="inline-form" onSubmit={handleCapacity} noValidate>
        <div className="field">
          <label htmlFor="cupo">Cupo de suscripciones anuales</label>
          <input id="cupo" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-outline btn-sm" disabled={busy}>
          Guardar el cupo
        </button>
        <button
          type="button"
          className={enrollment.enrollments_open ? 'btn btn-ghost btn-sm' : 'btn btn-solid btn-sm'}
          disabled={busy}
          onClick={() => setToggling(true)}
        >
          {enrollment.enrollments_open ? 'Cerrar inscripciones' : 'Abrir inscripciones'}
        </button>
      </form>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={toggling}
        title={enrollment.enrollments_open ? 'Cerrar inscripciones' : 'Abrir inscripciones'}
        confirmLabel={enrollment.enrollments_open ? 'Cerrar' : 'Abrir'}
        onConfirm={async () => {
          const open = !enrollment.enrollments_open
          if (await save(open, enrollment.capacity)) {
            toast.show(open ? 'Abriste las inscripciones.' : 'Cerraste las inscripciones.')
          }
          setToggling(false)
        }}
        onClose={() => setToggling(false)}
      >
        {enrollment.enrollments_open ? (
          <p>El sitio deja de mostrar el pago y vuelve a mostrar la lista de espera. Nadie pierde su suscripción.</p>
        ) : (
          <>
            <p>El sitio empieza a mostrar el pago mientras quede cupo.</p>
            {!enrollment.opened_at && (
              <p>
                Es la primera apertura: quienes estén en la lista de espera hasta este momento participan del sorteo de
                becas. Quienes se anoten después, no.
              </p>
            )}
          </>
        )}
      </ConfirmDialog>
    </>
  )
}

// Cotización del dólar blue: se lee sola de dolarhoy.com y se puede cargar a mano.
export function FxSection() {
  const fx = useAsync(fetchFx)
  const prices = useAsync(fetchPublicPrices)
  return (
    <section className="panel stack-md" aria-labelledby="cotizacion">
      <h2 id="cotizacion" className="h-md">
        Cotización del dólar
      </h2>
      <p className="text-muted">
        Los precios del sitio están en dólares. Para cobrar en pesos se usan al dólar blue de venta de dolarhoy.com, que
        el CRM lee por su cuenta todos los días a las 10:07 y a las 16:07. Si la lectura falla, queda la última cotización buena y
        podés cargarla a mano.
      </p>
      {fx.loading && !fx.data && <Loading />}
      {Boolean(fx.error) && <LoadError error={fx.error} onRetry={fx.reload} />}
      {fx.data && (
        <FxView
          key={fx.data.recorded_at ?? 'sin'}
          fx={fx.data}
          planArs={prices.data?.plan.ars ?? null}
          onSaved={async () => {
            await Promise.all([fx.reload(), prices.reload()])
          }}
        />
      )}
    </section>
  )
}

function FxView({ fx, planArs, onSaved }: { fx: FxStatus; planArs: number | null; onSaved: () => Promise<void> }) {
  const toast = useToast()
  const [rate, setRate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = parseArsNumber(rate)
    if (!value) {
      setError('Escribí el precio en pesos de un dólar, por ejemplo 1.565.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await setFxManual(value, note.trim())
      toast.show('Cargaste la cotización.')
      await onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No pudimos guardar la cotización.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {fx.rate === null ? (
        <p className="form-note form-note-error">Todavía no hay cotización: el sitio no puede mostrar precios en pesos.</p>
      ) : (
        <dl className="data-list">
          <div>
            <dt>Dólar blue (venta)</dt>
            <dd>
              <span className="cell-strong">{formatMoney(fx.rate, 'ARS')}</span>
            </dd>
          </div>
          <div>
            <dt>De dónde salió</dt>
            <dd>
              {fx.source === 'manual' ? `Carga manual${fx.recorded_by_email ? ` de ${fx.recorded_by_email}` : ''}` : 'dolarhoy.com'}
              {fx.recorded_at ? `, el ${formatDateTime(fx.recorded_at)}` : ''}
              {fx.source_updated_text ? ` (dolarhoy.com la actualizó el ${fx.source_updated_text})` : ''}
            </dd>
          </div>
          {planArs !== null && (
            <div>
              <dt>Suscripción anual en pesos</dt>
              <dd>{formatMoney(planArs, 'ARS')}</dd>
            </div>
          )}
        </dl>
      )}
      {fx.stale && fx.rate !== null && (
        <p className="form-note form-note-error">La cotización tiene más de 4 días. Revisala o cargala a mano.</p>
      )}
      {fx.last_check_result && (
        <p className={fx.last_check_result === 'ok' ? 'text-muted' : 'form-note form-note-error'}>
          {FX_CHECK_TEXT[fx.last_check_result]}
          {fx.last_check_at ? ` Fue el ${formatDateTime(fx.last_check_at)}.` : ''}
          {fx.last_check_result === 'salto_grande' && fx.last_check_detail ? ` Leyó ${fx.last_check_detail}.` : ''}
        </p>
      )}
      <form className="inline-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="cotizacion-manual">Cargar a mano (pesos por dólar)</label>
          <input id="cotizacion-manual" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="1.565" />
        </div>
        <div className="field field-grow">
          <label htmlFor="cotizacion-nota">Nota</label>
          <input id="cotizacion-nota" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-outline btn-sm" disabled={busy}>
          {busy ? 'Guardando…' : 'Cargar'}
        </button>
      </form>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
      {fx.history.length > 1 && (
        <details className="disclosure">
          <summary>Últimas cotizaciones</summary>
          <ul className="plain-list">
            {fx.history.map((h) => (
              <li key={h.at}>
                {formatDateTime(h.at)}: {formatMoney(h.rate, 'ARS')} · {h.source === 'manual' ? `a mano${h.by ? ` (${h.by})` : ''}` : h.source}
                {h.note ? ` · ${h.note}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
