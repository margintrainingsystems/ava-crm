import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { isValidEmail, normalizeEmail } from '../lib/validation'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isValidEmail(email)) {
      setError('Revisá el email: tiene que ser una dirección válida, sin espacios.')
      return
    }
    setBusy(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: `${window.location.origin}/definir-contrasena`,
    })
    setBusy(false)
    // Mostramos el mismo mensaje exista o no la cuenta, para no revelar quién está registrado.
    if (resetError && resetError.status === 429) {
      setError(errorMessage(resetError))
      return
    }
    setSent(true)
  }

  return (
    <main className="auth-page">
      <div className="auth-card stack-md">
        <Brand />
        <h1 className="h-lg">Recuperar la contraseña</h1>
        {sent ? (
          <>
            <p className="form-note" role="status">
              Si el email corresponde a una cuenta, te llega un link para crear una contraseña nueva. Revisá también la
              carpeta de spam.
            </p>
            <Link to="/ingresar" className="btn btn-outline">
              Volver a entrar
            </Link>
          </>
        ) : (
          <form className="stack-sm" onSubmit={handleSubmit} noValidate>
            <p className="text-muted">Escribí tu email y te mandamos un link para crear una contraseña nueva.</p>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="form-note form-note-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button type="submit" className="btn btn-solid" disabled={busy} aria-busy={busy}>
                {busy ? 'Enviando…' : 'Enviar link'}
              </button>
              <Link to="/ingresar" className="btn btn-ghost">
                Volver
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
