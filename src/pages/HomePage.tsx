import { Link } from 'react-router-dom'
import { useMember } from '../auth/context'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { firstName } from '../lib/format'
import { can, groupPermissions } from '../lib/permissions'
import { fetchPermissions, fetchRoles, fetchTeam } from '../lib/queries'
import { useAsync } from '../lib/useAsync'

export function HomePage() {
  const { member, access } = useMember()
  const permissions = useAsync(fetchPermissions)

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

      {member.isOwner && <OwnerNextSteps />}

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
        {can(access, 'auditoria.ver') && (
          <p>
            <Link className="text-link" to="/auditoria">
              Ver la auditoría
            </Link>
          </p>
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

async function loadOwnerOverview() {
  const [roles, team] = await Promise.all([fetchRoles(), fetchTeam()])
  return { roles: roles.length, members: team.filter((m) => !m.isOwner).length }
}

function OwnerNextSteps() {
  const overview = useAsync(loadOwnerOverview)
  if (overview.loading || !overview.data) return null
  const { roles, members } = overview.data
  if (roles > 0 && members > 0) return null

  return (
    <section className="panel stack-sm" aria-labelledby="primeros-pasos">
      <h2 id="primeros-pasos" className="h-md">
        Primeros pasos
      </h2>
      <ol className="steps">
        <li className={roles > 0 ? 'is-done' : undefined}>
          <Link className="text-link" to="/roles">
            Creá los roles
          </Link>{' '}
          <span className="text-muted">con los permisos de cada puesto: docente, atención, etcétera.</span>
        </li>
        <li className={members > 0 ? 'is-done' : undefined}>
          <Link className="text-link" to="/equipo">
            Invitá a tu equipo
          </Link>{' '}
          <span className="text-muted">y asignale un rol a cada persona.</span>
        </li>
      </ol>
    </section>
  )
}
