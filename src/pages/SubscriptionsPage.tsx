import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMember } from '../auth/context'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import {
  PROVIDER_LABEL,
  REFUND_REASON_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  cancelSubscription,
  fetchEnrollment,
  fetchMasters,
  fetchSubscription,
  fetchSubscriptions,
  formatMoney,
  localDay,
  parseArsNumber,
  refundPayment,
  registerPayment,
  type Currency,
  type Payment,
  type Provider,
  type RefundReason,
  type Subscription,
  type SubscriptionStatus,
} from '../lib/billing'
import { formatDay, fromLocalInput, toLocalInput } from '../lib/compliance'
import { fetchPeople, personName } from '../lib/crm'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { can } from '../lib/permissions'
import { useAsync } from '../lib/useAsync'

const TABS: { key: SubscriptionStatus; label: string }[] = [
  { key: 'activa', label: 'Activas' },
  { key: 'cancelada', label: 'Dadas de baja' },
  { key: 'vencida', label: 'Vencidas' },
  { key: 'reembolsada', label: 'Reembolsadas' },
]

// Plazos que siguen abiertos para el último cobro: la devolución todavía se puede pedir.
export function openDeadlines(s: Pick<Subscription, 'guarantee_until' | 'withdrawal_until'>, today: string): string[] {
  const out: string[] = []
  if (s.guarantee_until && s.guarantee_until >= today) out.push(`En garantía hasta el ${formatDay(s.guarantee_until)}`)
  if (s.withdrawal_until && s.withdrawal_until >= today) out.push(`Puede arrepentirse hasta el ${formatDay(s.withdrawal_until)}`)
  return out
}

function todayAr(): string {
  return toLocalInput().slice(0, 10)
}

export function SubscriptionsPage() {
  const { access } = useMember()
  const [params, setParams] = useSearchParams()
  const page = useAsync(fetchSubscriptions)
  const enrollment = useAsync(fetchEnrollment)
  const [tab, setTab] = useState<SubscriptionStatus | null>(null)
  const [openId, setOpenId] = useState<string | null>(params.get('suscripcion'))
  const becaPick = params.get('beca')
  const [registering, setRegistering] = useState(Boolean(becaPick))
  const list = useMemo(() => page.data ?? [], [page.data])
  const linked = list.find((s) => s.id === params.get('suscripcion'))
  const activeTab: SubscriptionStatus = tab ?? linked?.status ?? 'activa'
  const rows = list.filter((s) => s.status === activeTab)
  const [today] = useState(todayAr)
  const canManage = can(access, 'suscripciones.gestionar') && can(access, 'personas.ver')

  return (
    <section className="stack-lg">
      <header className="page-header">
        <div className="stack-sm">
          <h1 className="h-xl" tabIndex={-1} data-page-title>
            Suscripciones
          </h1>
          <p className="text-muted measure">
            La suscripción anual y los Másteres sueltos, con sus cobros y plazos. Todo se renueva solo cada año: la baja
            corta la renovación y mantiene el acceso hasta el final del año pagado.
          </p>
          {enrollment.data && (
            <p>
              <strong>
                {enrollment.data.active_plans} de {enrollment.data.capacity}
              </strong>{' '}
              lugares del cupo ocupados por suscripciones anuales.{' '}
              {enrollment.data.enrollments_open ? 'Las inscripciones están abiertas.' : 'Las inscripciones están cerradas.'}
            </p>
          )}
        </div>
        {canManage && !registering && (
          <button type="button" className="btn btn-solid" onClick={() => setRegistering(true)}>
            Registrar un cobro
          </button>
        )}
      </header>

      {registering && (
        <NewPaymentForm
          becaPickId={becaPick}
          personId={params.get('persona')}
          onCancel={() => {
            setRegistering(false)
            if (becaPick) setParams({}, { replace: true })
          }}
          onSaved={async (id) => {
            setRegistering(false)
            setTab('activa')
            setOpenId(id)
            setParams({ suscripcion: id }, { replace: true })
            await Promise.all([page.reload(), enrollment.reload()])
          }}
        />
      )}

      <div className="segmented" role="group" aria-label="Estado de la suscripción">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={activeTab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
            <span className="segmented-count"> ({list.filter((s) => s.status === t.key).length})</span>
          </button>
        ))}
      </div>

      {page.loading && !page.data && <Loading />}
      {Boolean(page.error) && <LoadError error={page.error} onRetry={page.reload} />}
      {page.data && rows.length === 0 && <p className="empty-state">No hay suscripciones en esta lista.</p>}

      {rows.length > 0 && (
        <ul className="message-list">
          {rows.map((s) => (
            <li key={s.id} className="message">
              <button
                type="button"
                className="message-toggle"
                aria-expanded={openId === s.id}
                aria-controls={`sus-${s.id}`}
                onClick={() => setOpenId(openId === s.id ? null : s.id)}
              >
                <span className="message-main">
                  <span className="message-title">
                    {s.person_name ?? 'Sin nombre'}{' '}
                    <span className={`status-tag${s.status === 'activa' ? ' status-nuevo' : ''}`}>
                      {SUBSCRIPTION_STATUS_LABEL[s.status]}
                    </span>
                  </span>
                  <span className="message-sub">
                    {s.product} · {PROVIDER_LABEL[s.provider]} · {s.currency}
                    {s.beca ? ' · con beca' : ''}
                  </span>
                  <span className="message-meta">
                    {s.status === 'activa' || s.status === 'cancelada'
                      ? `${s.status === 'activa' ? 'Se renueva' : 'Termina'} el ${formatDay(localDay(s.current_period_end))}`
                      : `Terminó el ${formatDay(localDay(s.current_period_end))}`}
                    {openDeadlines(s, today).map((d) => ` · ${d}`)}
                  </span>
                </span>
              </button>
              {openId === s.id && (
                <div id={`sus-${s.id}`} className="message-detail">
                  <SubscriptionDetailView
                    id={s.id}
                    onChanged={async () => {
                      await Promise.all([page.reload(), enrollment.reload()])
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SubscriptionDetailView({ id, onChanged }: { id: string; onChanged: () => Promise<void> }) {
  const { access } = useMember()
  const toast = useToast()
  const detail = useAsync(() => fetchSubscription(id))
  const [cancelling, setCancelling] = useState(false)
  const [renewing, setRenewing] = useState(false)
  const [refunding, setRefunding] = useState<Payment | null>(null)
  const manage = can(access, 'suscripciones.gestionar')

  if (detail.loading && !detail.data) return <Loading />
  if (detail.error || !detail.data) return <LoadError error={detail.error} onRetry={detail.reload} />
  const d = detail.data

  async function reloadAll() {
    await Promise.all([detail.reload(), onChanged()])
  }

  return (
    <div className="stack-md">
      <dl className="data-list">
        <div>
          <dt>Código</dt>
          <dd>{d.code}</dd>
        </div>
        <div>
          <dt>Desde</dt>
          <dd>{formatDateTime(d.started_at)}</dd>
        </div>
        <div>
          <dt>Año en curso</dt>
          <dd>
            {formatDay(localDay(d.current_period_start))} al {formatDay(localDay(d.current_period_end))}
          </dd>
        </div>
        <div>
          <dt>Renovación</dt>
          <dd>
            {d.auto_renew ? 'Automática' : 'No se renueva'}
            {d.renewal_amount !== null && d.renewal_notice_for
              ? ` · avisamos que cobra ${formatMoney(d.renewal_amount, d.currency)}`
              : ''}
          </dd>
        </div>
        {d.notes && (
          <div>
            <dt>Notas</dt>
            <dd>{d.notes}</dd>
          </div>
        )}
      </dl>

      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">Cobros de la suscripción</caption>
          <thead>
            <tr>
              <th scope="col">Cobro</th>
              <th scope="col">Monto</th>
              <th scope="col">Plazos</th>
              <th scope="col">
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {d.payments.map((p) => (
              <tr key={p.id}>
                <td data-label="Cobro">
                  <span className="cell-strong">{p.kind === 'alta' ? 'Alta' : 'Renovación'}</span>
                  <span className="cell-sub">
                    {formatDateTime(p.paid_at)} · {PROVIDER_LABEL[p.provider]}
                    {p.provider_payment_id ? ` · ${p.provider_payment_id}` : ''}
                  </span>
                </td>
                <td data-label="Monto" className="cell-nowrap">
                  {p.amount === null ? 'Oculto para tu rol' : formatMoney(p.amount, p.currency)}
                  {p.fx_rate ? <span className="cell-sub cell-nowrap">Dólar blue: {formatMoney(p.fx_rate, 'ARS')}</span> : null}
                  {p.beca && <span className="cell-sub">Con beca</span>}
                  {p.status !== 'aprobado' && (
                    <span className="cell-sub">
                      {p.status === 'reembolsado' ? 'Devuelto' : 'Devolución parcial'}
                      {p.refunded_amount !== null ? `: ${formatMoney(p.refunded_amount, p.currency)}` : ''}
                      {p.refund_reason ? ` (${REFUND_REASON_LABEL[p.refund_reason].toLowerCase()})` : ''}
                    </span>
                  )}
                </td>
                <td data-label="Plazos">
                  {p.guarantee_until && <span className="cell-sub">Garantía hasta el {formatDay(p.guarantee_until)}</span>}
                  <span className="cell-sub">Arrepentimiento hasta el {formatDay(p.withdrawal_until)}</span>
                </td>
                <td>
                  {manage && p.status !== 'reembolsado' && p.amount !== null && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefunding(p)}>
                      Registrar devolución
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-actions">
        {can(access, 'personas.ver') && (
          <Link className="btn btn-ghost btn-sm" to={`/personas/${d.person_id}`}>
            Ver la ficha
          </Link>
        )}
        {manage && d.status !== 'reembolsada' && !renewing && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setRenewing(true)}>
            Registrar renovación
          </button>
        )}
        {manage && d.status === 'activa' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelling(true)}>
            Dar de baja
          </button>
        )}
      </div>

      {renewing && (
        <RenewalForm
          subscriptionId={d.id}
          currency={d.currency}
          provider={d.provider}
          suggested={d.renewal_amount}
          onCancel={() => setRenewing(false)}
          onSaved={async () => {
            setRenewing(false)
            toast.show('Registraste la renovación: la suscripción suma un año.')
            await reloadAll()
          }}
        />
      )}

      <ConfirmDialog
        open={cancelling}
        title="Dar de baja"
        confirmLabel="Dar de baja"
        onConfirm={async () => {
          try {
            await cancelSubscription(d.id, 'Baja registrada desde el CRM')
            setCancelling(false)
            toast.show('Registraste la baja: no se renueva y mantiene el acceso hasta el final del año.')
            await reloadAll()
          } catch (e) {
            toast.show(errorMessage(e, 'No pudimos registrar la baja.'), 'error')
          }
        }}
        onClose={() => setCancelling(false)}
      >
        <p>
          La suscripción de <strong>{d.person_name}</strong> no se va a renovar. Mantiene el acceso hasta el{' '}
          {formatDay(localDay(d.current_period_end))}.
        </p>
        <p>Si pidió la baja con el botón del sitio, confirmásela también por email desde Mensajes.</p>
      </ConfirmDialog>

      {refunding && (
        <RefundDialog
          payment={refunding}
          onClose={() => setRefunding(null)}
          onSaved={async () => {
            setRefunding(null)
            toast.show('Registraste la devolución.')
            await reloadAll()
          }}
        />
      )}
    </div>
  )
}

function RefundDialog({ payment, onClose, onSaved }: { payment: Payment; onClose: () => void; onSaved: () => Promise<void> }) {
  const pending = (payment.amount ?? 0) - (payment.refunded_amount ?? 0)
  const [today] = useState(todayAr)
  const suggestedReason: RefundReason =
    payment.guarantee_until && payment.guarantee_until >= today
      ? 'garantia'
      : payment.withdrawal_until >= today
        ? 'arrepentimiento'
        : 'otro'
  const [amount, setAmount] = useState(String(pending))
  const [reason, setReason] = useState<RefundReason>(suggestedReason)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    const value = parseArsNumber(amount)
    if (!value || value > pending) {
      setError('Revisá el monto: no puede superar lo cobrado.')
      return
    }
    if (reason === 'otro' && !note.trim()) {
      setError('Contá el motivo de la devolución.')
      return
    }
    try {
      await refundPayment(payment.id, value, reason, note.trim())
      await onSaved()
    } catch (e) {
      setError(errorMessage(e, 'No pudimos registrar la devolución.'))
    }
  }

  return (
    <ConfirmDialog open title="Registrar devolución" confirmLabel="Registrar devolución" onConfirm={confirm} onClose={onClose}>
      <p>
        Primero hacé la devolución en {PROVIDER_LABEL[payment.provider]}. Acá queda la constancia. Si devolvés todo, la
        suscripción termina y libera su lugar del cupo.
      </p>
      <div className="field">
        <label htmlFor="dev-monto">Monto ({payment.currency})</label>
        <input id="dev-monto" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="dev-motivo">Motivo</label>
        <select id="dev-motivo" value={reason} onChange={(e) => setReason(e.target.value as RefundReason)}>
          {(Object.keys(REFUND_REASON_LABEL) as RefundReason[]).map((r) => (
            <option key={r} value={r}>
              {REFUND_REASON_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="dev-nota">Nota</label>
        <input id="dev-nota" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
    </ConfirmDialog>
  )
}

function RenewalForm({
  subscriptionId,
  currency,
  provider,
  suggested,
  onCancel,
  onSaved,
}: {
  subscriptionId: string
  currency: Currency
  provider: Provider
  suggested: number | null
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const [amount, setAmount] = useState(suggested ? String(suggested) : '')
  const [paidAt, setPaidAt] = useState(() => toLocalInput())
  const [operation, setOperation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = parseArsNumber(amount)
    const iso = fromLocalInput(paidAt)
    if (!value) return setError('Revisá el monto.')
    if (!iso) return setError('Revisá la fecha del cobro.')
    setError(null)
    setBusy(true)
    try {
      await registerPayment({
        personId: null, kind: null, masterId: null, amount: value, currency, paidAt: iso, provider,
        providerPaymentId: operation.trim(), subscriptionId,
      })
      await onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No pudimos registrar la renovación.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel stack-md" onSubmit={handleSubmit} noValidate>
      <h3 className="h-sm">Registrar renovación</h3>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`ren-monto-${subscriptionId}`}>Monto cobrado ({currency})</label>
          <input id={`ren-monto-${subscriptionId}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`ren-fecha-${subscriptionId}`}>Cuándo se cobró</label>
          <input id={`ren-fecha-${subscriptionId}`} type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`ren-op-${subscriptionId}`}>Número de operación</label>
        <input id={`ren-op-${subscriptionId}`} value={operation} maxLength={200} onChange={(e) => setOperation(e.target.value)} />
      </div>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-solid btn-sm" disabled={busy}>
          {busy ? 'Guardando…' : 'Registrar'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function NewPaymentForm({
  becaPickId,
  personId: initialPerson,
  onCancel,
  onSaved,
}: {
  becaPickId: string | null
  personId: string | null
  onCancel: () => void
  onSaved: (subscriptionId: string) => Promise<void>
}) {
  const toast = useToast()
  const people = useAsync(fetchPeople)
  const masters = useAsync(fetchMasters)
  const [personId, setPersonId] = useState(initialPerson ?? '')
  const [product, setProduct] = useState('plan')
  const [provider, setProvider] = useState<Provider>('mercadopago')
  const [currency, setCurrency] = useState<Currency>('ARS')
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(() => toLocalInput())
  const [operation, setOperation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sortedPeople = useMemo(
    () => [...(people.data ?? [])].sort((a, b) => personName(a).localeCompare(personName(b), 'es')),
    [people.data],
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = parseArsNumber(amount)
    const iso = fromLocalInput(paidAt)
    if (!personId) return setError('Elegí a la persona.')
    if (!value) return setError('Revisá el monto.')
    if (!iso) return setError('Revisá la fecha del cobro.')
    setError(null)
    setBusy(true)
    try {
      const id = await registerPayment({
        personId,
        kind: product === 'plan' ? 'plan' : 'master',
        masterId: product === 'plan' ? null : product,
        amount: value,
        currency,
        paidAt: iso,
        provider,
        providerPaymentId: operation.trim(),
        becaPickId: becaPickId ?? undefined,
      })
      toast.show(becaPickId ? 'Registraste el alta con la beca.' : 'Registraste el alta.')
      await onSaved(id)
    } catch (err) {
      setError(errorMessage(err, 'No pudimos registrar el cobro.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel stack-md" onSubmit={handleSubmit} noValidate>
      <h2 className="h-md">{becaPickId ? 'Registrar el alta con beca' : 'Registrar un cobro'}</h2>
      <p className="text-muted">
        Para cobros que no llegaron solos (por ejemplo, una transferencia). Cuando se conecten Mercado Pago y PayPal, los
        cobros se registran solos.
        {becaPickId ? ' La beca se aplica a la suscripción anual: cargá el monto con el descuento.' : ''}
      </p>
      <div className="field">
        <label htmlFor="alta-persona">Persona</label>
        <select id="alta-persona" value={personId} onChange={(e) => setPersonId(e.target.value)} disabled={Boolean(becaPickId)}>
          <option value="">Elegí a la persona</option>
          {sortedPeople.map((p) => (
            <option key={p.id} value={p.id}>
              {personName(p)}
              {p.email ? ` · ${p.email}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="alta-producto">Qué pagó</label>
          <select id="alta-producto" value={product} onChange={(e) => setProduct(e.target.value)} disabled={Boolean(becaPickId)}>
            <option value="plan">Suscripción anual (todos los Másteres)</option>
            {(masters.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                Máster {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="alta-medio">Medio de pago</label>
          <select id="alta-medio" value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="alta-moneda">Moneda</label>
          <select id="alta-moneda" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="ARS">Pesos argentinos (ARS)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="alta-monto">Monto cobrado</label>
          <input id="alta-monto" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="626.000" />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="alta-fecha">Cuándo se cobró (hora de Buenos Aires)</label>
          <input id="alta-fecha" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="alta-op">Número de operación</label>
          <input id="alta-op" value={operation} maxLength={200} onChange={(e) => setOperation(e.target.value)} />
        </div>
      </div>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-solid" disabled={busy} aria-busy={busy}>
          {busy ? 'Guardando…' : 'Registrar'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
