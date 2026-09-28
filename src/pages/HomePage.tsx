import { Link } from 'react-router-dom'
import { useMember } from '../auth/context'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import {
  DATA_REQUEST_KIND_LABEL,
  dueText,
  dueTone,
  fetchToday,
  formatDay,
  hoursLeftText,
  isPast,
  yearsText,
  type Today,
  type TodayRequest,
} from '../lib/compliance'
import { NUCLEO_URL } from '../lib/config'
import { firstName, formatDateTime, plural } from '../lib/format'
import { sourceLabel } from '../lib/messages'
import { groupPermissions } from '../lib/permissions'
import { fetchPermissions } from '../lib/queries'
import { useAsync } from '../lib/useAsync'

// Qué pasa con el email de confirmación de cada pedido.
export function requestEmailText(status: TodayRequest['email_status'], ready?: boolean): string {
  if (status === 'pendiente' || status === 'enviando') {
    return ready ? ' · el email de confirmación sale en unos minutos' : ' · confirmalo a mano: los envíos automáticos no están activos'
  }
  if (status === 'fallido') return ' · el email automático falló: confirmalo a mano'
  if (status === 'cancelado') return ' · el email automático se canceló: confirmalo a mano'
  return ' · sin email automático: confirmalo a mano'
}

// Hay algo para hacer hoy en alguna de las secciones que el rol puede ver.
export function hasPending(t: Today): boolean {
  return Boolean(
    t.requests?.length ||
      t.data_requests?.length ||
      t.unread_count ||
      t.expired_count ||
      t.missing_holiday_years?.length ||
      t.failed_emails,
  )
}

export function HomePage() {
  const { member, access } = useMember()
  const today = useAsync(fetchToday)
  const permissions = useAsync(fetchPermissions)

  return (
    <section className="stack-lg">
      <header className="stack-sm">
        <h1 className="h-xl" tabIndex={-1} data-page-title>
          Hola, {firstName(member.displayName, member.email)}
        </h1>
        <p className="text-muted">
          {today.data ? `Hoy es ${formatDay(today.data.today)}. ` : ''}
          {member.isOwner
            ? 'Sos la propietaria del CRM y tenés todos los permisos.'
            : `Tu rol es ${member.roleName ?? 'sin nombre'}.`}
        </p>
      </header>

      {today.loading && !today.data && <Loading />}
      {Boolean(today.error) && <LoadError error={today.error} onRetry={today.reload} />}
      {today.data && <TodayPanels t={today.data} isOwner={member.isOwner} />}

      {member.isOwner && (
        <p className="panel">
          El equipo, los roles, la auditoría y los feriados se administran en{' '}
          <a className="text-link" href={`${NUCLEO_URL}/equipo.html`} target="_blank" rel="noopener noreferrer">
            Núcleo<span className="visually-hidden"> (se abre en otra pestaña)</span>
          </a>
          .
        </p>
      )}

      <section className="stack-sm" aria-labelledby="tu-acceso">
        <h2 id="tu-acceso" className="h-md">
          Lo que podés hacer
        </h2>
        {permissions.loading && <Loading />}
        {Boolean(permissions.error) && <LoadError error={permissions.error} onRetry={permissions.reload} />}
        {permissions.data && (
          <AccessSummary
            groups={groupPermissions(permissions.data.filter((p) => access.isOwner || access.permissions.has(p.key)))}
          />
        )}
      </section>
    </section>
  )
}

function TodayPanels({ t, isOwner }: { t: Today; isOwner: boolean }) {
  const missing = t.missing_holiday_years ?? []
  return (
    <div className="stack-md">
      {missing.length > 0 && (
        <div className="panel panel-warning" role="note">
          <p>
            <strong>Faltan los feriados de {yearsText(missing)}.</strong> Sin ellos, los plazos en días hábiles pueden
            quedar más cortos de lo que dice la ley.{' '}
            {isOwner ? (
              <a className="text-link" href={`${NUCLEO_URL}/feriados.html`} target="_blank" rel="noopener noreferrer">
                Cargalos en Núcleo<span className="visually-hidden"> (se abre en otra pestaña)</span>
              </a>
            ) : (
              'Avisale a la propietaria para que los cargue.'
            )}
          </p>
        </div>
      )}

      {t.requests && (
        <section className="stack-sm" aria-labelledby="hoy-pedidos">
          <h2 id="hoy-pedidos" className="h-md">
            Arrepentimiento y baja por confirmar
          </h2>
          {t.requests.length === 0 ? (
            <p className="text-muted">No hay pedidos sin confirmar.</p>
          ) : (
            <ul className="today-list">
              {t.requests.map((r) => {
                const late = isPast(r.deadline)
                return (
                  <li key={r.id} className="today-item">
                    <Link className="today-link" to={`/mensajes?mensaje=${r.id}`}>
                      <span className="today-title">
                        {sourceLabel(r.source)} · {r.request_code ?? 'sin código'}
                      </span>
                      <span className="today-sub">
                        {r.name ?? 'Sin nombre'} · llegó el {formatDateTime(r.created_at)}
                        {requestEmailText(r.email_status, t.email_ready)}
                      </span>
                    </Link>
                    <span className={late ? 'due due-late' : 'due due-soon'}>{hoursLeftText(r.deadline)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {t.data_requests && (
        <section className="stack-sm" aria-labelledby="hoy-datos">
          <h2 id="hoy-datos" className="h-md">
            Pedidos de datos pendientes
          </h2>
          {t.data_requests.length === 0 ? (
            <p className="text-muted">
              No hay pedidos de acceso, corrección o borrado pendientes.{' '}
              <Link className="text-link" to="/pedidos-de-datos">
                Registrar uno
              </Link>
            </p>
          ) : (
            <ul className="today-list">
              {t.data_requests.map((r) => (
                <li key={r.id} className="today-item">
                  <Link className="today-link" to={`/pedidos-de-datos?pedido=${r.id}`}>
                    <span className="today-title">
                      {DATA_REQUEST_KIND_LABEL[r.kind]} · {r.code}
                    </span>
                    <span className="today-sub">
                      {r.name ?? 'Sin nombre'} · vence el {formatDay(r.due_date)}
                      {r.identity_verified ? '' : ' · identidad sin verificar'}
                    </span>
                  </Link>
                  <span className={`due due-${dueTone(r.days_left)}`}>{dueText(r.days_left)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {t.unread && (
        <section className="stack-sm" aria-labelledby="hoy-mensajes">
          <h2 id="hoy-mensajes" className="h-md">
            Mensajes sin leer
          </h2>
          {t.unread.length === 0 ? (
            <p className="text-muted">No hay mensajes sin leer.</p>
          ) : (
            <>
              <ul className="today-list">
                {t.unread.map((m) => (
                  <li key={m.id} className="today-item">
                    <Link className="today-link" to={`/mensajes?mensaje=${m.id}`}>
                      <span className="today-title">{m.name ?? 'Sin nombre'}</span>
                      <span className="today-sub">
                        {sourceLabel(m.source)}
                        {m.motivo ? ` · ${m.motivo}` : ''} · {formatDateTime(m.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {(t.unread_count ?? 0) > t.unread.length && (
                <p>
                  <Link className="text-link" to="/mensajes">
                    Ver los {t.unread_count} mensajes sin leer
                  </Link>
                </p>
              )}
            </>
          )}
        </section>
      )}

      {Boolean(t.failed_emails) && (
        <p className="panel panel-warning">
          {plural(t.failed_emails ?? 0, 'email no pudo salir', 'emails no pudieron salir')}.{' '}
          <Link className="text-link" to="/emails">
            Revisalos en Emails
          </Link>
        </p>
      )}

      {Boolean(t.expired_count) && (
        <p className="panel">
          {plural(t.expired_count ?? 0, 'formulario cumplió', 'formularios cumplieron')} el plazo de guarda de la Política
          de privacidad.{' '}
          <Link className="text-link" to="/retencion">
            Revisalos en Retención
          </Link>
        </p>
      )}

      {!hasPending(t) && <p className="panel">Todo al día: no hay nada pendiente en tus secciones.</p>}
    </div>
  )
}

function AccessSummary({ groups }: { groups: ReturnType<typeof groupPermissions> }) {
  if (groups.length === 0) {
    return (
      <p className="text-muted">
        Tu rol todavía no tiene permisos. Pedile a la propietaria que te asigne los que necesitás.
      </p>
    )
  }
  return (
    <dl className="access-list">
      {groups.map((g) => (
        <div key={g.area} className="access-group">
          <dt>{g.area}</dt>
          {g.permissions.map((p) => (
            <dd key={p.key}>
              <strong>{p.label}.</strong> <span className="text-muted">{p.description}</span>
            </dd>
          ))}
        </div>
      ))}
    </dl>
  )
}
