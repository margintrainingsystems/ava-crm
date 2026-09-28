import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMember } from '../auth/context'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import { RETENTION_RULE, fetchExpired, purgeExpired, type ExpiredLead } from '../lib/compliance'
import { notifyMessagesChanged } from '../lib/crm'
import { errorMessage } from '../lib/errors'
import { formatDate, formatDateTime, plural } from '../lib/format'
import { fullName, sourceLabel } from '../lib/messages'
import { can } from '../lib/permissions'
import { useAsync } from '../lib/useAsync'

const RULE_ORDER = ['contacto', 'arrepentimiento', 'baja'] as const

export function purgeSummary(result: { mensajes: number; personas: number }): string {
  if (result.mensajes === 0) return 'No se borró nada: los formularios tuvieron actividad nueva y ya no están vencidos.'
  const people = result.personas > 0 ? ` y ${plural(result.personas, 'persona que quedó', 'personas que quedaron')} sin formularios` : ''
  return `Borraste ${plural(result.mensajes, 'formulario vencido', 'formularios vencidos')}${people}.`
}

export function RetentionPage() {
  const { access } = useMember()
  const toast = useToast()
  const page = useAsync(fetchExpired)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const rows = useMemo(() => page.data ?? [], [page.data])
  // Solo cuentan los que siguen en la lista (por ejemplo, después de recargar).
  const chosen = rows.filter((r) => selected.has(r.id))
  const allChosen = rows.length > 0 && chosen.length === rows.length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function purge() {
    try {
      const result = await purgeExpired(chosen.map((r) => r.id))
      setConfirming(false)
      setSelected(new Set())
      notifyMessagesChanged()
      toast.show(purgeSummary(result))
      await page.reload()
    } catch (e) {
      toast.show(errorMessage(e, 'No pudimos borrar los formularios.'), 'error')
    }
  }

  return (
    <section className="stack-lg">
      <header className="stack-sm">
        <h1 className="h-xl" tabIndex={-1} data-page-title>
          Retención
        </h1>
        <p className="text-muted measure">
          La Política de privacidad promete borrar los datos cuando se cumple el plazo de guarda. Acá aparecen los
          formularios que ya lo cumplieron. Nada se borra solo: revisalos y confirmá el borrado.
        </p>
      </header>

      <section className="panel stack-sm" aria-labelledby="plazos">
        <h2 id="plazos" className="h-md">
          Plazos de guarda
        </h2>
        <dl className="data-list">
          {RULE_ORDER.map((source) => (
            <div key={source}>
              <dt>{sourceLabel(source)}</dt>
              <dd>{RETENTION_RULE[source]}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted">
          La lista de espera no vence por fecha: se borra después del sorteo de becas, cuando esté la sección de
          inscripciones.
        </p>
      </section>

      {page.loading && !page.data && <Loading />}
      {Boolean(page.error) && <LoadError error={page.error} onRetry={page.reload} />}
      {page.data && rows.length === 0 && <p className="empty-state">No hay formularios vencidos.</p>}

      {rows.length > 0 && (
        <>
          <div className="toolbar">
            <label className="check-inline">
              <input
                type="checkbox"
                checked={allChosen}
                onChange={() => setSelected(allChosen ? new Set() : new Set(rows.map((r) => r.id)))}
              />
              Elegir los {rows.length}
            </label>
            <button
              type="button"
              className="btn btn-danger"
              disabled={chosen.length === 0}
              onClick={() => setConfirming(true)}
            >
              {chosen.length === 0 ? 'Borrar' : `Borrar ${plural(chosen.length, 'formulario', 'formularios')}`}
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Formularios con el plazo de guarda vencido</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Elegir</span>
                  </th>
                  <th scope="col">Persona</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Llegó</th>
                  <th scope="col">Venció</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <ExpiredRow key={r.id} r={r} checked={selected.has(r.id)} onToggle={() => toggle(r.id)} linkPerson={can(access, 'personas.ver')} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        title="Borrar formularios vencidos"
        confirmLabel="Borrar"
        danger
        onConfirm={purge}
        onClose={() => setConfirming(false)}
      >
        <p>
          Vas a borrar {plural(chosen.length, 'formulario', 'formularios')}. Si una persona se queda sin formularios, también
          se borra su ficha con sus notas. No se puede deshacer.
        </p>
        <p>Los pedidos de datos quedan como constancia. La auditoría registra cuántos se borraron, sin datos personales.</p>
      </ConfirmDialog>
    </section>
  )
}

function ExpiredRow({
  r,
  checked,
  onToggle,
  linkPerson,
}: {
  r: ExpiredLead
  checked: boolean
  onToggle: () => void
  linkPerson: boolean
}) {
  const name = fullName(r.first_name, r.last_name)
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          className="row-check"
          checked={checked}
          onChange={onToggle}
          aria-label={`Elegir el formulario de ${name}`}
        />
      </td>
      <td data-label="Persona">
        {linkPerson && r.person_id ? (
          <Link className="cell-link cell-strong" to={`/personas/${r.person_id}`}>
            {name}
          </Link>
        ) : (
          <span className="cell-strong">{name}</span>
        )}
      </td>
      <td data-label="Tipo">
        {sourceLabel(r.source)}
        {r.request_code ? ` · ${r.request_code}` : ''}
      </td>
      <td data-label="Llegó" className="cell-nowrap">
        {formatDateTime(r.created_at)}
      </td>
      <td data-label="Venció" className="cell-nowrap">
        {formatDate(r.expires_at)}
      </td>
    </tr>
  )
}
