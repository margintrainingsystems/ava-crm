import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { Brand } from '../components/Brand'
import { LoadingScreen } from '../components/StatusScreens'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { isValidEmail, normalizeEmail } from '../lib/validation'

export function LoginPage() {
  const { state } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'ready') return <Navigate to={from} replace />

  const notice = state.status === 'signed_out' ? state.notice : undefined

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isValidEmail(email)) {
      setError('Revisá el email: tiene que ser una dirección válida, sin espacios.')
      return
    }
    if (!password) {
      setError('Escribí tu contraseña.')
      return
    }
    setBusy(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password })
    setBusy(false)
    if (signInError) setError(errorMessage(signInError, 'No pudimos iniciar sesión. Probá de nuevo.'))
  }

  return (
    <main className="auth-page">
      <div className="auth-card stack-md">
        <Brand />
        <div className="stack-sm">
          <h1 className="h-lg">Entrar al CRM</h1>
          <p className="text-muted">Usá el email y la contraseña de tu cuenta del equipo de AVA.</p>
        </div>

        {notice && (
          <p className="form-note" role="status">
            {notice}
          </p>
        )}

        <form className="stack-sm" onSubmit={handleSubmit} noValidate>
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
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <div className="input-with-action">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="input-action"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          {error && (
            <p className="form-note form-note-error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-solid" disabled={busy} aria-busy={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <Link to="/recuperar" className="btn btn-ghost">
              Olvidé mi contraseña
            </Link>
          </div>
        </form>
      </div>
    </main>
  )
}
