import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMember } from '../auth/context'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import {
  EMAIL_KIND_LABEL,
  EMAIL_STATUS_LABEL,
  cancelEmail,
  fetchEmailSettings,
  fetchEmails,
  sendNow,
  sendResultText,
  type Email,
} from '../lib/emails'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { sourceLabel } from '../lib/messages'
import { can } from '../lib/permissions'
import { useAsync } from '../lib/useAsync'

type Tab = 'cola' | 'enviados' | 'error' | 'cancelados'

const TABS: { key: Tab; label: string; empty: string }[] = [
  { key: 'cola', label: 'En cola', empty: 'No hay emails esperando para salir.' },
  { key: 'enviados', label: 'Enviados', empty: 'Todavía no salió ningún email.' },
  { key: 'error', label: 'Con error', empty: 'No hay emails con error.' },
  { key: 'cancelados', label: 'Cancelados', empty: 'No hay emails cancelados.' },
]

export function emailTab(e: Pick<Email, 'status'>): Tab {
  if (e.status === 'enviado') return 'enviados'
  if (e.status === 'fallido') return 'error'
  if (e.status === 'cancelado') return 'cancelados'
  return 'cola'
}

export function recipientText(e: Pick<Email, 'person_name' | 'to_email' | 'contact_hidden'>): string {
  const who = e.person_name ?? 'Sin ficha'
  if (e.contact_hidden || !e.to_email) return who
  return e.person_name ? `${who} · ${e.to_email}` : e.to_email
}

export function EmailsPage() {
  const { access } = useMember()
  const toast = useToast()
  const [params] = useSearchParams()
  const page = useAsync(fetchEmails)
  const settings = useAsync(fetchEmailSettings)
  const [tab, setTab] = useState<Tab | null>(null)
  const [openId, setOpenId] = useState<string | null>(params.get('email'))
  const [busy, setBusy] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<Email | null>(null)
  const list = useMemo(() => page.data ?? [], [page.data])
  const opened = list.find((e) => e.id === params.get('email'))
  const activeTab: Tab = tab ?? (opened ? emailTab(opened) : 'cola')
  const rows = list.filter((e) => emailTab(e) === activeTab)
  const ready = settings.data?.provider_ready ?? false

  async function send(e: Email) {
    setBusy(e.id)
    try {
      const result = await sendNow([e.id])
      toast.show(sendResultText(result), result.configurado && (result.fallidos ?? 0) > 0 ? 'error' : 'ok')
      await Promise.all([page.reload(), settings.reload()])
    } catch (err) {
      toast.show(errorMessage(err, err instanceof Error ? err.message : 'No se pudo enviar.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function confirmCancel() {
    if (!cancelling) return
    try {
      await cancelEmail(cancelling.id)
      setCancelling(null)
      toast.show('Cancelaste el email: no va a salir.')
      await page.reload()
    } catch (err) {
      toast.show(errorMessage(err, 'No se pudo cancelar.'), 'error')
    }
  }

  return (
    <section className="stack-lg">
      <header className="stack-sm">
        <h1 className="h-xl" tabIndex={-1} data-page-title>
          Emails
        </h1>
        <p className="text-muted measure">
          Todo lo que sale del CRM por email: las confirmaciones automáticas de arrepentimiento y baja, y los emails que
          escribe el equipo desde cada ficha. Cada envío queda en la ficha de la persona.
        </p>
      </header>

      {settings.data && !ready && (
        <div className="panel panel-warning" role="note">
          <p>
            <strong>Los envíos todavía no están activos.</strong> Falta conectar Resend. Mientras tanto, los emails quedan
            en cola y los pedidos de arrepentimiento y baja se confirman a mano desde Mensajes, como hasta ahora.
            {can(access, 'configuracion.editar') ? (
              <>
                {' '}
                <Link className="text-link" to="/configuracion">
                  Ver cómo activarlos
                </Link>
              </>
            ) : (
              ' La propietaria lo está configurando.'
            )}
          </p>
        </div>
      )}

      <div className="segmented" role="group" aria-label="Estado del email">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={activeTab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
            <span className="segmented-count"> ({list.filter((e) => emailTab(e) === t.key).length})</span>
          </button>
        ))}
      </div>

      {page.loading && !page.data && <Loading />}
      {Boolean(page.error) && <LoadError error={page.error} onRetry={page.reload} />}
      {page.data && rows.length === 0 && (
        <p className="empty-state">{TABS.find((t) => t.key === activeTab)?.empty}</p>
      )}

      {rows.length > 0 && (
        <ul className="message-list">
          {rows.map((e) => (
            <li key={e.id} className="message">
              <button
                type="button"
                className="message-toggle"
                aria-expanded={openId === e.id}
                aria-controls={`email-${e.id}`}
                onClick={() => setOpenId(openId === e.id ? null : e.id)}
              >
                <span className="message-main">
                  <span className="message-title">
                    {e.subject}{' '}
                    <span className={`status-tag${e.status === 'fallido' ? ' status-error' : ''}`}>
                      {EMAIL_STATUS_LABEL[e.status]}
                    </span>
                  </span>
                  <span className="message-sub">
                    {recipientText(e)} · {EMAIL_KIND_LABEL[e.kind]}
                    {e.lead_source ? ` (${sourceLabel(e.lead_source).toLowerCase()})` : ''}
                  </span>
                  <span className="message-meta">
                    {e.sent_at ? `Salió el ${formatDateTime(e.sent_at)}` : `Creado el ${formatDateTime(e.created_at)}`}
                  </span>
                </span>
              </button>
              {openId === e.id && (
                <div id={`email-${e.id}`} className="message-detail stack-md">
                  <p className="message-text">{e.body}</p>
                  <dl className="data-list">
                    <div>
                      <dt>Para</dt>
                      <dd>{e.contact_hidden ? `${e.person_name ?? 'Sin ficha'} (email oculto para tu rol)` : e.to_email}</dd>
                    </div>
                    <div>
                      <dt>Lo creó</dt>
                      <dd>{e.created_by_email ?? 'El CRM, automático'}</dd>
                    </div>
                    {e.attempts > 0 && (
                      <div>
                        <dt>Intentos</dt>
                        <dd>{e.attempts}</dd>
                      </div>
                    )}
                    {e.last_error && e.status !== 'enviado' && (
                      <div>
                        <dt>Último error</dt>
                        <dd>{e.last_error}</dd>
                      </div>
                    )}
                    {e.cancel_reason && (
                      <div>
                        <dt>Por qué no salió</dt>
                        <dd>{e.cancel_reason}</dd>
                      </div>
                    )}
                  </dl>
                  {e.person_id && can(access, 'personas.ver') && (
                    <p>
                      <Link className="text-link" to={`/personas/${e.person_id}`}>
                        Ver la ficha
                      </Link>
                    </p>
                  )}
                  {e.can_handle && (e.status === 'pendiente' || e.status === 'fallido') && (
                    <div className="form-actions">
                      <button
                        type="button"
                        className="btn btn-solid btn-sm"
                        onClick={() => void send(e)}
                        disabled={busy !== null}
                        aria-busy={busy === e.id}
                      >
                        {busy === e.id ? 'Enviando…' : e.status === 'fallido' ? 'Reintentar' : 'Enviar ahora'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelling(e)}>
                        Cancelar el envío
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        title="Cancelar el envío"
        confirmLabel="Cancelar el envío"
        onConfirm={confirmCancel}
        onClose={() => setCancelling(null)}
      >
        <p>
          El email <strong>{cancelling?.subject}</strong> no va a salir. Queda en la lista de cancelados con tu nombre.
        </p>
        {cancelling?.kind === 'confirmacion' && (
          <p>Si cancelás una confirmación automática, acordate de confirmar el pedido a mano desde Mensajes.</p>
        )}
      </ConfirmDialog>
    </section>
  )
}
