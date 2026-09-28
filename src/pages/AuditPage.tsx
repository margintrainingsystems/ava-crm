import { useState } from 'react'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { Link } from 'react-router-dom'
import { auditActor, auditPersonLink, describeAuditEntry, type AuditEntry } from '../lib/audit'
import { formatDateTime } from '../lib/format'
import { AUDIT_PAGE_SIZE, fetchAudit, fetchPermissions, fetchRoles, type AuditFilter } from '../lib/queries'
import { useAsync } from '../lib/useAsync'

const FILTERS: { value: AuditFilter; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'personas', label: 'Personas y mensajes' },
  { value: 'equipo', label: 'Personas del equipo' },
  { value: 'roles', label: 'Roles y permisos' },
]

type Lookup = { roleNames: Map<string, string>; permissionLabels: Map<string, string> }

async function loadLookup(): Promise<Lookup> {
  const [roles, permissions] = await Promise.all([fetchRoles(), fetchPermissions()])
  return {
    roleNames: new Map(roles.map((r) => [r.id, r.name])),
    permissionLabels: new Map(permissions.map((p) => [p.key, p.label])),
  }
}

const EMPTY_LOOKUP: Lookup = { roleNames: new Map(), permissionLabels: new Map() }

export function AuditPage() {
  const lookup = useAsync(loadLookup)
  const [filter, setFilter] = useState<AuditFilter>('todo')

  return (
    <section className="stack-lg">
      <header className="stack-sm">
        <h1 className="h-xl" tabIndex={-1} data-page-title>
          Auditoría
        </h1>
        <p className="text-muted measure">
          Quién abrió fichas, descargó datos o cambió algo en el CRM, y cuándo. Nadie puede editar ni borrar este registro.
        </p>
      </header>

      <div className="field field-inline">
        <label htmlFor="audit-filter">Mostrar</label>
        <select id="audit-filter" value={filter} onChange={(e) => setFilter(e.target.value as AuditFilter)}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {/* La lista se vuelve a montar al cambiar el filtro, así arranca desde la primera página. */}
      <AuditList key={filter} filter={filter} lookup={lookup.data ?? EMPTY_LOOKUP} />
    </section>
  )
}

function AuditList({ filter, lookup }: { filter: AuditFilter; lookup: Lookup }) {
  const first = useAsync(() => fetchAudit(filter, null))
  const [more, setMore] = useState<AuditEntry[]>([])
  const [lastPageSize, setLastPageSize] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<unknown>(null)

  const entries = [...(first.data ?? []), ...more]
  const hasMore = (lastPageSize ?? first.data?.length ?? 0) === AUDIT_PAGE_SIZE

  async function loadMore() {
    const oldest = entries[entries.length - 1]
    if (!oldest) return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const page = await fetchAudit(filter, oldest.id)
      setMore((prev) => [...prev, ...page])
      setLastPageSize(page.length)
    } catch (e) {
      setMoreError(e)
    } finally {
      setLoadingMore(false)
    }
  }

  if (first.loading) return <Loading />
  if (first.error) return <LoadError error={first.error} onRetry={first.reload} />
  if (entries.length === 0) return <p className="text-muted">Todavía no hay registros.</p>

  return (
    <div className="stack-md">
      <ol className="audit-list">
        {entries.map((entry) => (
          <li key={entry.id} className="audit-item">
            <time dateTime={entry.at} className="audit-time">
              {formatDateTime(entry.at)}
            </time>
            <p className="audit-text">
              <span className="audit-actor">{auditActor(entry)}</span> {describeAuditEntry(entry, lookup)}
              {auditPersonLink(entry) && (
                <>
                  {' · '}
                  <Link className="text-link" to={auditPersonLink(entry) ?? '/personas'}>
                    Ver ficha
                  </Link>
                </>
              )}
            </p>
          </li>
        ))}
      </ol>
      {Boolean(moreError) && <LoadError error={moreError} onRetry={() => void loadMore()} />}
      {loadingMore && <Loading />}
      {hasMore && !loadingMore && (
        <button type="button" className="btn btn-outline" onClick={() => void loadMore()}>
          Ver registros anteriores
        </button>
      )}
    </div>
  )
}
