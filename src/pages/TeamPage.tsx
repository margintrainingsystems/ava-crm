import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { Modal } from '../components/Modal'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { fetchRoles, fetchTeam, removeMember, updateMember, type RoleSummary, type TeamMember } from '../lib/queries'
import { fetchMemberStatuses, inviteMember, memberState, resendInvitation, type MemberState } from '../lib/team'
import { useAsync } from '../lib/useAsync'
import { DISPLAY_NAME_MAX, isValidEmail, normalizeEmail } from '../lib/validation'

async function loadTeamPage() {
  const [team, roles] = await Promise.all([fetchTeam(), fetchRoles()])
  // El estado de las invitaciones viene de la Edge Function. Si falla, la pantalla sigue funcionando.
  const statuses = await fetchMemberStatuses().catch(() => null)
  return { team, roles, statuses }
}

const STATE_LABEL: Record<MemberState, string> = {
  propietaria: 'Propietaria',
  activa: 'Activa',
  pendiente: 'Invitación pendiente',
  desactivada: 'Desactivada',
  desconocido: 'Activa',
}

export function TeamPage() {
  const page = useAsync(loadTeamPage)
  const toast = useToast()
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [removing, setRemoving] = useState<TeamMember | null>(null)
  const [toggling, setToggling] = useState<TeamMember | null>(null)

  const roles = page.data?.roles ?? []
  const roleName = (id: string | null) => roles.find((r) => r.id === id)?.name ?? 'Sin rol'

  async function handleResend(member: TeamMember) {
    try {
      await resendInvitation(member.userId)
      toast.show(`Reenviamos la invitación a ${member.email}.`)
    } catch (e) {
      toast.show(errorMessage(e, (e as Error).message), 'error')
    }
  }

  async function confirmToggle() {
    if (!toggling) return
    try {
      await updateMember(toggling.userId, { active: !toggling.active })
      toast.show(toggling.active ? `Desactivaste a ${toggling.email}.` : `Reactivaste a ${toggling.email}.`)
      setToggling(null)
      await page.reload()
    } catch (e) {
      toast.show(errorMessage(e), 'error')
    }
  }

  async function confirmRemove() {
    if (!removing) return
    try {
      await removeMember(removing.userId)
      toast.show(`Quitaste a ${removing.email} del equipo.`)
      setRemoving(null)
      await page.reload()
    } catch (e) {
      toast.show(errorMessage(e), 'error')
    }
  }

  return (
    <section className="stack-lg">
      <header className="page-header">
        <div className="stack-sm">
          <h1 className="h-xl" tabIndex={-1} data-page-title>
            Equipo
          </h1>
          <p className="text-muted measure">
            Invitá a las personas que trabajan con vos y elegí el rol de cada una. Solo vos ves y cambiás esta sección.
          </p>
        </div>
        <button type="button" className="btn btn-solid" onClick={() => setInviting(true)} disabled={roles.length === 0}>
          Invitar a una persona
        </button>
      </header>

      {page.data && roles.length === 0 && (
        <p className="form-note">
          Para invitar a alguien primero necesitás un rol.&nbsp;
          <Link className="text-link" to="/roles">
            Crear un rol
          </Link>
        </p>
      )}

      {page.loading && !page.data && <Loading />}
      {Boolean(page.error) && <LoadError error={page.error} onRetry={page.reload} />}

      {page.data && (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Personas del equipo</caption>
            <thead>
              <tr>
                <th scope="col">Persona</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col">Último ingreso</th>
                <th scope="col">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.data.team.map((m) => {
                const status = page.data?.statuses?.get(m.userId)
                const state = memberState(m, status, page.data?.statuses != null)
                return (
                  <tr key={m.userId}>
                    <td data-label="Persona">
                      <span className="cell-strong">{m.displayName || m.email}</span>
                      {m.displayName && <span className="cell-sub">{m.email}</span>}
                    </td>
                    <td data-label="Rol">{m.isOwner ? 'Todos los permisos' : roleName(m.roleId)}</td>
                    <td data-label="Estado">
                      <span className={`badge badge-${state}`}>{STATE_LABEL[state]}</span>
                    </td>
                    <td data-label="Último ingreso" className="cell-nowrap">
                      {formatDateTime(status?.ultimo_ingreso)}
                    </td>
                    <td>
                      {!m.isOwner && (
                        <div className="cell-actions">
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            aria-label={`Editar a ${m.displayName || m.email}`}
                            onClick={() => setEditing(m)}
                          >
                            Editar
                          </button>
                          {state === 'pendiente' && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              aria-label={`Reenviar la invitación a ${m.displayName || m.email}`}
                              onClick={() => void handleResend(m)}
                            >
                              Reenviar invitación
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label={`${m.active ? 'Desactivar' : 'Reactivar'} a ${m.displayName || m.email}`}
                            onClick={() => setToggling(m)}
                          >
                            {m.active ? 'Desactivar' : 'Reactivar'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label={`Quitar del equipo a ${m.displayName || m.email}`}
                            onClick={() => setRemoving(m)}
                          >
                            Quitar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {inviting && (
        <InviteForm
          roles={roles}
          onClose={() => setInviting(false)}
          onDone={async (message) => {
            setInviting(false)
            toast.show(message)
            await page.reload()
          }}
        />
      )}

      {editing && (
        <EditMemberForm
          member={editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null)
            toast.show('Guardaste los cambios.')
            await page.reload()
          }}
        />
      )}

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.active ? 'Desactivar acceso' : 'Reactivar acceso'}
        confirmLabel={toggling?.active ? 'Desactivar' : 'Reactivar'}
        danger={toggling?.active}
        onConfirm={confirmToggle}
        onClose={() => setToggling(null)}
      >
        {toggling?.active ? (
          <p>
            <strong>{toggling.email}</strong> deja de ver el CRM en este momento. Su rol queda guardado por si la
            reactivás.
          </p>
        ) : (
          <p>
            <strong>{toggling?.email}</strong> vuelve a entrar al CRM con el rol que tenía.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={removing !== null}
        title="Quitar del equipo"
        confirmLabel="Quitar"
        danger
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      >
        <p>
          <strong>{removing?.email}</strong> deja de ser parte del equipo y pierde el acceso al CRM. Su cuenta de AVA
          sigue existiendo: si también es estudiante, conserva el Campus.
        </p>
        <p>La auditoría conserva todo lo que hizo.</p>
      </ConfirmDialog>
    </section>
  )
}

type InviteProps = {
  roles: RoleSummary[]
  onClose: () => void
  onDone: (message: string) => Promise<void>
}

function InviteForm({ roles, onClose, onDone }: InviteProps) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) return setError('Escribí el nombre de la persona.')
    if (!isValidEmail(email)) return setError('Revisá el email: tiene que ser una dirección válida, sin espacios.')
    if (!roleId) return setError('Elegí un rol.')
    setError(null)
    setBusy(true)
    try {
      const result = await inviteMember({ email: normalizeEmail(email), display_name: displayName.trim(), role_id: roleId })
      await onDone(
        result.estado === 'invitada'
          ? `Le enviamos la invitación a ${normalizeEmail(email)}.`
          : `${normalizeEmail(email)} ya tenía cuenta en AVA: la sumamos al equipo y entra con su contraseña de siempre.`,
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title="Invitar a una persona" onClose={onClose}>
      <form className="stack-md" onSubmit={handleSubmit} noValidate>
        <p className="text-muted">
          Le llega un email con un link para crear su contraseña. Si el link vence antes de que lo use, podés reenviarlo desde esta pantalla.
        </p>
        <div className="field">
          <label htmlFor="invite-name">Nombre y apellido</label>
          <input
            id="invite-name"
            value={displayName}
            maxLength={DISPLAY_NAME_MAX}
            autoComplete="off"
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="invite-email">Email</label>
          <input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <RoleSelect id="invite-role" roles={roles} value={roleId} onChange={setRoleId} />
        {error && (
          <p className="form-note form-note-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-solid" disabled={busy} aria-busy={busy}>
            {busy ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

type EditProps = {
  member: TeamMember
  roles: RoleSummary[]
  onClose: () => void
  onDone: () => Promise<void>
}

function EditMemberForm({ member, roles, onClose, onDone }: EditProps) {
  const [displayName, setDisplayName] = useState(member.displayName)
  const [roleId, setRoleId] = useState(member.roleId ?? roles[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) return setError('Escribí el nombre de la persona.')
    if (!roleId) return setError('Elegí un rol.')
    setError(null)
    setBusy(true)
    try {
      await updateMember(member.userId, { display_name: displayName.trim(), role_id: roleId })
      await onDone()
    } catch (err) {
      setError(errorMessage(err, 'No pudimos guardar los cambios.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title={`Editar a ${member.displayName || member.email}`} onClose={onClose}>
      <form className="stack-md" onSubmit={handleSubmit} noValidate>
        <p className="text-muted">
          Email: <strong>{member.email}</strong>
        </p>
        <div className="field">
          <label htmlFor="edit-name">Nombre y apellido</label>
          <input
            id="edit-name"
            value={displayName}
            maxLength={DISPLAY_NAME_MAX}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </div>
        <RoleSelect id="edit-role" roles={roles} value={roleId} onChange={setRoleId} />
        {error && (
          <p className="form-note form-note-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-solid" disabled={busy} aria-busy={busy}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RoleSelect(props: { id: string; roles: RoleSummary[]; value: string; onChange: (id: string) => void }) {
  const selected = props.roles.find((r) => r.id === props.value)
  return (
    <div className="field">
      <label htmlFor={props.id}>Rol</label>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value)} required>
        {props.roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      {selected?.description && <p className="field-help">{selected.description}</p>}
    </div>
  )
}
