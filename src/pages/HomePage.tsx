import { Link } from 'react-router-dom'
import { useMember } from '../auth/context'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { firstName } from '../lib/format'
import { can, groupPermissions } from '../lib/permissions'
import { fetchPermissions } from '../lib/queries'
import { NUCLEO_URL } from '../lib/config'
import { useAsync } from '../lib/useAsync'
import { useUnreadCount } from '../lib/useUnreadCount'
import { MESSAGE_PERMISSIONS } from '../components/AppLayout'

export function HomePage() {
  const { member, access } = useMember()
  const permissions = useAsync(fetchPermissions)
  const seesMessages = MESSAGE_PERMISSIONS.some((p) => can(access, p))
  const unread = useUnreadCount(seesMessages)

  return (
    <section className="stack-lg">
      <header className="stack-sm">
        <h1 className="h-xl" tabIndex={-1} data-page-title>
          Hola, {firstName(member.displayName, member.email)}
        </h1>
        <p className="text-muted">
          {member.isOwner
            ? 'Sos la propietaria del CRM y tenés todos los permisos.'
            : `Tu rol es ${member.roleName ?? 'sin nombre'}.`}
        </p>
      </header>

      {seesMessages && (
        <p className="panel">
          {unread === 0 ? (
            'No hay mensajes sin leer.'
          ) : (
            <>
              {unread === 1 ? 'Hay 1 mensaje sin leer. ' : `Hay ${unread} mensajes sin leer. `}
              <Link className="text-link" to="/mensajes">
                Ir a Mensajes
              </Link>
            </>
          )}
        </p>
      )}

      {member.isOwner && (
        <p className="panel">
          El equipo, los roles y la auditoría se administran en{' '}
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
