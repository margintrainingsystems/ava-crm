import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMember } from '../auth/context'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import {
  PAYMENT_STATUS_LABEL,
  PROVIDER_LABEL,
  fetchPayments,
  fetchPaymentsReport,
  formatMoney,
  monthRange,
  paymentsCsvRows,
  type Payment,
  type Provider,
} from '../lib/billing'
import { formatDay, toLocalInput } from '../lib/compliance'
import { buildCsv, downloadFile } from '../lib/csv'
import { formatDateTime } from '../lib/format'
import { can } from '../lib/permissions'
import { useAsync } from '../lib/useAsync'

type Range = { from: string; to: string }

export function PaymentsPage() {
  const [range, setRange] = useState<Range>(() => monthRange(toLocalInput().slice(0, 10)))
  const [draft, setDraft] = useState<Range>(range)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.from || !draft.to || draft.from > draft.to) {
      setError('Revisá las fechas: la primera tiene que ser anterior a la segunda.')
      return
    }
    setError(null)
    setRange(draft)
  }

  return (
    <section className="stack-lg">
      <header className="stack-sm">
        <h1 className="h-xl" tabIndex={-1} data-page-title>
          Pagos
        </h1>
        <p className="text-muted measure">
          Lo cobrado por suscripciones y Másteres, separado por moneda. Las fechas son de Buenos Aires y las devoluciones
          se restan del cobro original.
        </p>
      </header>

      <form className="toolbar" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="pagos-desde">Desde</label>
          <input id="pagos-desde" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="pagos-hasta">Hasta</label>
          <input id="pagos-hasta" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </div>
        <button type="submit" className="btn btn-outline">
          Ver
        </button>
      </form>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}

      <PaymentsResults key={`${range.from}_${range.to}`} range={range} />
    </section>
  )
}

function PaymentsResults({ range }: { range: Range }) {
  const { access } = useMember()
  const report = useAsync(() => fetchPaymentsReport(range.from, range.to))
  const canList = can(access, 'pagos.ver')

  return (
    <div className="stack-lg">
      <section className="stack-md" aria-labelledby="pagos-totales">
        <h2 className="h-md" id="pagos-totales">
          Del {formatDay(range.from)} al {formatDay(range.to)}
        </h2>
        {report.loading && !report.data && <Loading />}
        {Boolean(report.error) && <LoadError error={report.error} onRetry={report.reload} />}
        {report.data && report.data.length === 0 && <p className="empty-state">No hubo cobros en estas fechas.</p>}
        {report.data && report.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Totales por moneda</caption>
              <thead>
                <tr>
                  <th scope="col">Moneda</th>
                  <th scope="col">Cobros</th>
                  <th scope="col">Cobrado</th>
                  <th scope="col">Devuelto</th>
                  <th scope="col">Neto</th>
                </tr>
              </thead>
              <tbody>
                {report.data.map((r) => (
                  <tr key={r.currency}>
                    <th scope="row" data-label="Moneda">
                      {r.currency === 'ARS' ? 'Pesos' : 'Dólares'}
                    </th>
                    <td data-label="Cobros">
                      {r.payments}
                      {r.becas > 0 && <span className="cell-sub">{r.becas === 1 ? '1 con beca' : `${r.becas} con beca`}</span>}
                    </td>
                    <td data-label="Cobrado">{formatMoney(r.gross, r.currency)}</td>
                    <td data-label="Devuelto">{formatMoney(r.refunded, r.currency)}</td>
                    <td data-label="Neto">
                      <span className="cell-strong">{formatMoney(r.net, r.currency)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {report.data && report.data.length > 1 && (
          <p className="text-muted">Cada moneda se suma por separado: no convertimos una en la otra.</p>
        )}
      </section>

      {canList && <PaymentsList range={range} />}
    </div>
  )
}

function PaymentsList({ range }: { range: Range }) {
  const { access } = useMember()
  const list = useAsync(() => fetchPayments(range.from, range.to))
  const rows = list.data ?? []

  function exportCsv() {
    const csv = paymentsCsvRows(rows)
    downloadFile(`ava-pagos-${range.from}-a-${range.to}.csv`, buildCsv(csv.header, csv.rows))
  }

  return (
    <section className="stack-md" aria-labelledby="pagos-detalle">
      <div className="page-header">
        <h2 className="h-md" id="pagos-detalle">
          Cada cobro
        </h2>
        {rows.length > 0 && (
          <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv}>
            Descargar CSV
          </button>
        )}
      </div>
      {list.loading && !list.data && <Loading />}
      {Boolean(list.error) && <LoadError error={list.error} onRetry={list.reload} />}
      {list.data && rows.length === 0 && <p className="empty-state">No hay cobros para mostrar.</p>}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Cobros</caption>
            <thead>
              <tr>
                <th scope="col">Persona</th>
                <th scope="col">Cobro</th>
                <th scope="col">Monto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td data-label="Persona">
                    {can(access, 'personas.ver') ? (
                      <Link className="cell-link cell-strong" to={`/personas/${p.person_id}`}>
                        {p.person_name ?? 'Sin nombre'}
                      </Link>
                    ) : (
                      <span className="cell-strong">{p.person_name ?? 'Sin nombre'}</span>
                    )}
                    <span className="cell-sub">{p.product}</span>
                  </td>
                  <td data-label="Cobro">
                    {p.kind === 'alta' ? 'Alta' : 'Renovación'} · {formatDateTime(p.paid_at)}
                    <span className="cell-sub">
                      {PROVIDER_LABEL[p.provider as Provider] ?? p.provider}
                      {p.provider_payment_id ? ` · ${p.provider_payment_id}` : ''}
                    </span>
                    {can(access, 'suscripciones.ver') && (
                      <Link className="text-link cell-sub" to={`/suscripciones?suscripcion=${p.subscription_id}`}>
                        {p.code}
                      </Link>
                    )}
                  </td>
                  <td data-label="Monto">
                    {formatMoney(p.amount, p.currency)}
                    {p.fx_rate ? <span className="cell-sub cell-nowrap">Dólar blue: {formatMoney(p.fx_rate, 'ARS')}</span> : null}
                    {p.beca && <span className="cell-sub">Con beca</span>}
                    {p.status !== 'aprobado' && (
                      <span className="cell-sub">
                        {PAYMENT_STATUS_LABEL[p.status as Payment['status']]}: {formatMoney(p.refunded_amount, p.currency)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
