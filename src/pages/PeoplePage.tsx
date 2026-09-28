import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMember } from '../auth/context'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import { downloadFile, todayStamp } from '../lib/csv'
import { fetchPeople, logExport, personName, type PersonSummary } from '../lib/crm'
import { peopleCsv } from '../lib/exports'
import { formatDateTime } from '../lib/format'
import { SOURCES, SOURCE_LABEL, type Source } from '../lib/messages'
import { can } from '../lib/permissions'
import { useAsync } from '../lib/useAsync'

// Búsqueda sin tildes ni mayúsculas: "lucia" encuentra a "Lucía".
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function filterPeople(people: PersonSummary[], query: string, source: Source | 'todas'): PersonSummary[] {
  const q = normalizeSearch(query)
  return people.filter((p) => {
    if (source !== 'todas' && !p.sources.includes(source)) return false
    if (!q) return true
    const haystack = normalizeSearch([p.first_name, p.last_name, p.email, p.phone, p.country, ...p.tags].filter(Boolean).join(' '))
    return q.split(/\s+/).every((word) => haystack.includes(word))
  })
}

export function PeoplePage() {
  const { access } = useMember()
  const toast = useToast()
  const page = useAsync(fetchPeople)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<Source | 'todas'>('todas')

  const rows = useMemo(() => filterPeople(page.data ?? [], query, source), [page.data, query, source])
  const contactHidden = page.data?.[0]?.contact_hidden ?? false

  function exportCsv() {
    if (rows.length === 0) {
      toast.show('No hay nada para descargar con estos filtros.')
      return
    }
    downloadFile(`ava-personas-${todayStamp()}.csv`, peopleCsv(rows))
    void logExport('exportar_personas', 'crm_people', { cantidad: rows.length })
  }

  return (
    <section className="stack-lg">
      <header className="page-header">
        <div className="stack-sm">
          <h1 className="h-xl" tabIndex={-1} data-page-title>
            Personas
          </h1>
          <p className="text-muted measure">
            Una ficha por persona, con todo lo que llegó desde el sitio. Los formularios con el mismo email se juntan solos.
          </p>
        </div>
        {can(access, 'personas.exportar') && (
          <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={!page.data}>
            Descargar CSV
          </button>
        )}
      </header>

      <div className="toolbar">
        <div className="field field-grow">
          <label htmlFor="buscar-persona">Buscar</label>
          <input
            id="buscar-persona"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={contactHidden ? 'Nombre, país o etiqueta' : 'Nombre, email, teléfono, país o etiqueta'}
          />
        </div>
        <div className="field">
          <label htmlFor="filtro-origen">Llegó por</label>
          <select id="filtro-origen" value={source} onChange={(e) => setSource(e.target.value as Source | 'todas')}>
            <option value="todas">Cualquier formulario</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {page.loading && !page.data && <Loading />}
      {Boolean(page.error) && <LoadError error={page.error} onRetry={page.reload} />}

      {page.data && page.data.length === 0 && (
        <p className="empty-state">Todavía no llegó nadie. Cuando alguien complete un formulario del sitio, aparece acá.</p>
      )}
      {page.data && page.data.length > 0 && rows.length === 0 && (
        <p className="empty-state">Nadie coincide con la búsqueda.</p>
      )}

      {rows.length > 0 && (
        <>
          <p className="text-muted" aria-live="polite">
            {rows.length === 1 ? '1 persona' : `${rows.length} personas`}
          </p>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Personas</caption>
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  <th scope="col">País</th>
                  <th scope="col">Llegó por</th>
                  <th scope="col">Mensajes</th>
                  <th scope="col">Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Persona">
                      <Link className="cell-strong cell-link" to={`/personas/${p.id}`}>
                        {personName(p)}
                      </Link>
                      <span className="cell-sub">{p.contact_hidden ? 'Contacto oculto' : (p.email ?? 'Sin email')}</span>
                      {p.tags.length > 0 && (
                        <span className="tag-list">
                          {p.tags.map((t) => (
                            <span key={t} className="tag">
                              {t}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td data-label="País">{p.country ?? '—'}</td>
                    <td data-label="Llegó por">{p.sources.map((s) => SOURCE_LABEL[s as Source] ?? s).join(', ') || '—'}</td>
                    <td data-label="Mensajes" className="cell-nowrap">
                      {p.message_count}
                    </td>
                    <td data-label="Última actividad" className="cell-nowrap">
                      {formatDateTime(p.last_activity_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
