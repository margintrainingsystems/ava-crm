import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { Modal } from '../components/Modal'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import { errorMessage } from '../lib/errors'
import { plural } from '../lib/format'
import { groupPermissions, type Permission } from '../lib/permissions'
import { deleteRole, fetchPermissions, fetchRoles, saveRole, type RoleSummary } from '../lib/queries'
import { useAsync } from '../lib/useAsync'
import { ROLE_DESCRIPTION_MAX, ROLE_NAME_MAX } from '../lib/validation'

async function loadRolesPage() {
  const [roles, permissions] = await Promise.all([fetchRoles(), fetchPermissions()])
  return { roles, permissions }
}

type Editing = { role: RoleSummary | null } | null

export function RolesPage() {
  const page = useAsync(loadRolesPage)
  const toast = useToast()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<RoleSummary | null>(null)

  async function confirmDelete() {
    if (!deleting) return
    try {
      await deleteRole(deleting.id)
      toast.show(`Borraste el rol "${deleting.name}".`)
      setDeleting(null)
      await page.reload()
    } catch (e) {
      toast.show(errorMessage(e, 'No pudimos borrar el rol.'), 'error')
    }
  }

  return (
    <section className="stack-lg">
      <header className="page-header">
        <div className="stack-sm">
          <h1 className="h-xl" tabIndex={-1} data-page-title>
            Roles y permisos
          </h1>
          <p className="text-muted measure">
            Cada rol reúne los permisos de un puesto. Si cambiás un rol, el cambio rige al instante para todas las
            personas que lo tienen.
          </p>
        </div>
        <button type="button" className="btn btn-solid" onClick={() => setEditing({ role: null })} disabled={!page.data}>
          Crear rol
        </button>
      </header>

      {page.loading && !page.data && <Loading />}
      {Boolean(page.error) && <LoadError error={page.error} onRetry={page.reload} />}

      {page.data && page.data.roles.length === 0 && (
        <div className="panel stack-sm">
          <h2 className="h-md">Todavía no hay roles</h2>
          <p className="text-muted">
            Creá uno por cada puesto de tu equipo, por ejemplo "Docente" o "Atención a estudiantes", y dale solo los
            permisos que necesita para su trabajo.
          </p>
        </div>
      )}

      {page.data && page.data.roles.length > 0 && (
        <ul className="card-list">
          {page.data.roles.map((role) => (
            <li key={role.id} className="card">
              <div className="card-main">
                <h2 className="h-md">{role.name}</h2>
                {role.description && <p className="text-muted">{role.description}</p>}
                <p className="card-meta">
                  {plural(role.permissionKeys.length, 'permiso', 'permisos')} ·{' '}
                  {plural(role.memberCount, 'persona', 'personas')}
                  {role.memberCount > 0 && ' · Para borrarlo, primero asigná otro rol a sus personas.'}
                </p>
              </div>
              <div className="card-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  aria-label={`Editar el rol ${role.name}`}
                  onClick={() => setEditing({ role })}
                >
                  Editar
                </button>
                {role.memberCount === 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Borrar el rol ${role.name}`}
                    onClick={() => setDeleting(role)}
                  >
                    Borrar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && page.data && (
        <RoleEditor
          role={editing.role}
          permissions={page.data.permissions}
          onClose={() => setEditing(null)}
          onSaved={async (name, isNew) => {
            setEditing(null)
            toast.show(isNew ? `Creaste el rol "${name}".` : `Guardaste los cambios de "${name}".`)
            await page.reload()
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Borrar rol"
        confirmLabel="Borrar"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        <p>
          Vas a borrar el rol <strong>{deleting?.name}</strong>. No se puede deshacer.
        </p>
      </ConfirmDialog>
    </section>
  )
}

type EditorProps = {
  role: RoleSummary | null
  permissions: Permission[]
  onClose: () => void
  onSaved: (name: string, isNew: boolean) => Promise<void>
}

// Permisos que dan acceso a datos personales sensibles o a acciones que no se pueden deshacer.
const SENSITIVE = new Set(['personas.ver_contacto', 'personas.exportar', 'personas.borrar', 'pagos.ver'])

function RoleEditor({ role, permissions, onClose, onSaved }: EditorProps) {
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissionKeys ?? []))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) {
      setError('Poné un nombre al rol.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveRole({
        id: role?.id ?? null,
        name: cleanName,
        description: description.trim(),
        permissionKeys: [...selected],
      })
      await onSaved(cleanName, role === null)
    } catch (err) {
      setError(
        (err as { code?: string }).code === '23505'
          ? 'Ya existe un rol con ese nombre.'
          : errorMessage(err, 'No pudimos guardar el rol.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title={role ? `Editar "${role.name}"` : 'Crear rol'} onClose={onClose} wide>
      <form className="stack-md" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="role-name">Nombre</label>
          <input
            id="role-name"
            value={name}
            maxLength={ROLE_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder="Por ejemplo: Docente"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="role-description">Descripción (opcional)</label>
          <input
            id="role-description"
            value={description}
            maxLength={ROLE_DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Para qué sirve este rol"
          />
        </div>

        <div className="stack-sm">
          <p className="field-help">Dale a cada rol solo lo que necesita. Los permisos marcados como sensibles dan acceso a datos personales o a acciones que no se pueden deshacer.</p>
          {groupPermissions(permissions).map((group) => (
            <fieldset key={group.area} className="perm-group">
              <legend>{group.area}</legend>
              {group.permissions.map((p) => (
                <div key={p.key} className="check-row">
                  <input
                    id={`perm-${p.key}`}
                    type="checkbox"
                    checked={selected.has(p.key)}
                    onChange={() => toggle(p.key)}
                    aria-describedby={`perm-${p.key}-desc`}
                  />
                  <label htmlFor={`perm-${p.key}`}>
                    <span className="check-label">
                      {p.label}
                      {SENSITIVE.has(p.key) && <span className="tag-sensitive">Sensible</span>}
                    </span>
                    <span id={`perm-${p.key}-desc`} className="check-desc">
                      {p.description}
                    </span>
                  </label>
                </div>
              ))}
            </fieldset>
          ))}
        </div>

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
            {busy ? 'Guardando…' : role ? 'Guardar cambios' : 'Crear rol'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
