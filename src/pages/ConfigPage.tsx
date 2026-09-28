import { useState, type FormEvent } from 'react'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import {
  PLACEHOLDER_HELP,
  checkEmailService,
  fetchEmailSettings,
  fetchTemplates,
  renderTemplate,
  saveEmailSettings,
  saveTemplate,
  sendResultText,
  sendTestEmail,
  unknownPlaceholders,
  type EmailSettings,
  type EmailTemplate,
} from '../lib/emails'
import { errorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { isValidEmail } from '../lib/validation'
import { EnrollmentSection, FxSection } from './ConfigBilling'

const SAMPLE: Record<string, string> = { nombre: 'Lucía', codigo: 'ARR-7KQ2MX' }

export function ConfigPage() {
  const settings = useAsync(fetchEmailSettings)
  const templates = useAsync(fetchTemplates)

  return (
    <section className="stack-lg">
      <header className="stack-sm">
        <h1 className="h-xl" tabIndex={-1} data-page-title>
          Configuración
        </h1>
        <p className="text-muted measure">
          Las inscripciones y el cupo, la cotización del dólar para los precios en pesos y cómo salen los emails del
          CRM: quién los firma, qué dicen y si las confirmaciones de pedidos salen solas.
        </p>
      </header>

      <EnrollmentSection />
      <FxSection />

      {settings.loading && !settings.data && <Loading />}
      {Boolean(settings.error) && <LoadError error={settings.error} onRetry={settings.reload} />}
      {settings.data && (
        <>
          <ServiceStatus settings={settings.data} onChecked={settings.reload} />
          <SenderForm
            key={[settings.data.from_name, settings.data.from_address, settings.data.reply_to, settings.data.auto_confirm].join('|')}
            settings={settings.data}
            onSaved={settings.reload}
          />
        </>
      )}

      <section className="stack-md" aria-labelledby="plantillas">
        <h2 id="plantillas" className="h-md">
          Plantillas
        </h2>
        {templates.loading && !templates.data && <Loading />}
        {Boolean(templates.error) && <LoadError error={templates.error} onRetry={templates.reload} />}
        {templates.data?.map((t) => (
          <TemplateForm key={`${t.key}-${t.updated_at}`} template={t} onSaved={templates.reload} />
        ))}
      </section>
    </section>
  )
}

function ServiceStatus({ settings, onChecked }: { settings: EmailSettings; onChecked: () => Promise<void> }) {
  const toast = useToast()
  const [busy, setBusy] = useState<'check' | 'test' | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [to, setTo] = useState('')
  const [testError, setTestError] = useState<string | null>(null)

  async function check() {
    setBusy('check')
    try {
      const result = await checkEmailService()
      setReason(result.configurado ? null : (result.mensaje ?? null))
      toast.show(result.configurado ? 'Resend está conectado: los emails ya pueden salir.' : 'Todavía falta un paso.')
      await onChecked()
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No pudimos revisar la conexión.', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function test(e: FormEvent) {
    e.preventDefault()
    if (!isValidEmail(to)) {
      setTestError('Escribí un email válido, sin espacios.')
      return
    }
    setTestError(null)
    setBusy('test')
    try {
      const result = await sendTestEmail(to.trim())
      if (!result.configurado) setTestError(result.mensaje ?? 'Los envíos todavía no están activos.')
      else toast.show(result.enviados ? `Mandamos la prueba a ${to.trim()}. Revisá la bandeja de entrada y el spam.` : sendResultText(result))
      await onChecked()
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'No pudimos mandar la prueba.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={settings.provider_ready ? 'panel stack-md' : 'panel panel-warning stack-md'} aria-labelledby="estado-envios">
      <h2 id="estado-envios" className="h-md">
        {settings.provider_ready ? 'Los envíos están activos' : 'Los envíos todavía no están activos'}
      </h2>
      <p className="text-muted">
        {settings.provider_checked_at
          ? `Última revisión: ${formatDateTime(settings.provider_checked_at)}.`
          : 'Todavía no se revisó la conexión.'}{' '}
        {reason}
      </p>
      {!settings.provider_ready && (
        <>
          <p>Mientras tanto, los emails quedan en cola y los pedidos se confirman a mano desde Mensajes. Para activarlos:</p>
          <ol className="steps">
            <li>En Resend, verificá el dominio desde el que vas a mandar (por ejemplo, aprendeconava.com).</li>
            <li>En Resend, creá una clave de API con permiso para enviar.</li>
            <li>
              En Supabase, en los secretos de Edge Functions, cargá la clave con el nombre <code>RESEND_API_KEY</code>.
            </li>
            <li>Acá abajo, elegí el email remitente: tiene que ser del dominio verificado.</li>
            <li>Tocá "Revisar la conexión" y mandate una prueba.</li>
            <li>Antes del primer envío real, sumá a Resend (Estados Unidos) en la Política de privacidad del sitio.</li>
          </ol>
        </>
      )}
      <div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void check()} disabled={busy !== null}>
          {busy === 'check' ? 'Revisando…' : 'Revisar la conexión'}
        </button>
      </div>
      <form className="inline-form" onSubmit={test} noValidate>
        <div className="field field-grow">
          <label htmlFor="prueba-email">Mandar un email de prueba a</label>
          <input
            id="prueba-email"
            type="email"
            value={to}
            maxLength={320}
            onChange={(e) => setTo(e.target.value)}
            placeholder="tu email"
          />
        </div>
        <button type="submit" className="btn btn-solid btn-sm" disabled={busy !== null || !to.trim()}>
          {busy === 'test' ? 'Mandando…' : 'Mandar prueba'}
        </button>
      </form>
      {testError && (
        <p className="form-note form-note-error" role="alert">
          {testError}
        </p>
      )}
    </section>
  )
}

function SenderForm({ settings, onSaved }: { settings: EmailSettings; onSaved: () => Promise<void> }) {
  const toast = useToast()
  const [fromName, setFromName] = useState(settings.from_name)
  const [fromAddress, setFromAddress] = useState(settings.from_address ?? '')
  const [replyTo, setReplyTo] = useState(settings.reply_to ?? '')
  const [autoConfirm, setAutoConfirm] = useState(settings.auto_confirm)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dirty =
    fromName !== settings.from_name ||
    fromAddress.trim() !== (settings.from_address ?? '') ||
    replyTo.trim() !== (settings.reply_to ?? '') ||
    autoConfirm !== settings.auto_confirm

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!fromName.trim()) return setError('Escribí el nombre que ve quien recibe el email.')
    if (fromAddress.trim() && !isValidEmail(fromAddress)) return setError('Revisá el email remitente.')
    if (replyTo.trim() && !isValidEmail(replyTo)) return setError('Revisá el email para las respuestas.')
    setError(null)
    setBusy(true)
    try {
      await saveEmailSettings({ fromName: fromName.trim(), fromAddress, replyTo, autoConfirm })
      toast.show(
        fromAddress.trim() !== (settings.from_address ?? '')
          ? 'Guardaste el remitente. Revisá la conexión para activar los envíos.'
          : 'Guardaste los cambios.',
      )
      await onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No pudimos guardar los cambios.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel stack-md" onSubmit={handleSubmit} noValidate aria-labelledby="remitente">
      <h2 id="remitente" className="h-md">
        Remitente
      </h2>
      <div className="field-row">
        <div className="field">
          <label htmlFor="rem-nombre">Nombre</label>
          <input id="rem-nombre" value={fromName} maxLength={80} onChange={(e) => setFromName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rem-email">Email remitente</label>
          <input
            id="rem-email"
            type="email"
            value={fromAddress}
            maxLength={320}
            onChange={(e) => setFromAddress(e.target.value)}
            aria-describedby="rem-email-ayuda"
            placeholder="hola@aprendeconava.com"
          />
          <p id="rem-email-ayuda" className="field-help">
            Del dominio que verificaste en Resend.
          </p>
        </div>
      </div>
      <div className="field">
        <label htmlFor="rem-respuestas">Las respuestas llegan a</label>
        <input
          id="rem-respuestas"
          type="email"
          value={replyTo}
          maxLength={320}
          onChange={(e) => setReplyTo(e.target.value)}
          aria-describedby="rem-respuestas-ayuda"
        />
        <p id="rem-respuestas-ayuda" className="field-help">
          Opcional. Si lo dejás vacío, las respuestas van al remitente.
        </p>
      </div>
      <label className="check-inline">
        <input type="checkbox" checked={autoConfirm} onChange={(e) => setAutoConfirm(e.target.checked)} />
        Mandar solas las confirmaciones de arrepentimiento y baja (Disposición 954/2025: dentro de las 24 horas)
      </label>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-solid" disabled={busy || !dirty} aria-busy={busy}>
          {busy ? 'Guardando…' : 'Guardar remitente'}
        </button>
      </div>
    </form>
  )
}

function TemplateForm({ template, onSaved }: { template: EmailTemplate; onSaved: () => Promise<void> }) {
  const toast = useToast()
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody] = useState(template.body)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dirty = subject !== template.subject || body !== template.body
  const unknown = unknownPlaceholders(`${subject}\n${body}`, template.placeholders)
  const id = template.key

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) return setError('El asunto y el texto no pueden quedar vacíos.')
    if (unknown.length > 0) return setError(`Estos marcadores no existen: ${unknown.map((u) => `{${u}}`).join(', ')}.`)
    setError(null)
    setBusy(true)
    try {
      await saveTemplate(template.key, subject, body)
      toast.show(`Guardaste la plantilla "${template.name}".`)
      await onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No pudimos guardar la plantilla.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel stack-md" onSubmit={handleSubmit} noValidate aria-labelledby={`pl-${id}`}>
      <div className="stack-sm">
        <h3 id={`pl-${id}`} className="h-sm">
          {template.name}
          {dirty && <span className="text-muted"> · sin guardar</span>}
        </h3>
        <p className="text-muted">{template.description}</p>
        {template.placeholders.length > 0 && (
          <p className="field-help">
            Podés usar:{' '}
            {template.placeholders.map((p, i) => (
              <span key={p}>
                {i > 0 ? ', ' : ''}
                <code>{`{${p}}`}</code> {PLACEHOLDER_HELP[p] ?? ''}
              </span>
            ))}
            .
          </p>
        )}
      </div>
      <div className="template-grid">
        <div className="stack-md">
          <div className="field">
            <label htmlFor={`pl-${id}-asunto`}>Asunto</label>
            <input id={`pl-${id}-asunto`} value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`pl-${id}-texto`}>Texto</label>
            <textarea
              id={`pl-${id}-texto`}
              rows={10}
              maxLength={20000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
        <div className="stack-sm" aria-label={`Vista previa de ${template.name}`} role="group">
          <p className="field-label">Así se ve (con datos de ejemplo)</p>
          <div className="email-preview">
            <p className="email-preview-subject">{renderTemplate(subject, SAMPLE)}</p>
            <p className="message-text">{renderTemplate(body, SAMPLE)}</p>
          </div>
        </div>
      </div>
      {error && (
        <p className="form-note form-note-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-solid btn-sm" disabled={busy || !dirty} aria-busy={busy}>
          {busy ? 'Guardando…' : 'Guardar plantilla'}
        </button>
        {dirty && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSubject(template.subject)
              setBody(template.body)
              setError(null)
            }}
          >
            Descartar cambios
          </button>
        )}
      </div>
      {template.updated_by_email && (
        <p className="field-help">
          Última edición: {template.updated_by_email}, {formatDateTime(template.updated_at)}.
        </p>
      )}
    </form>
  )
}
