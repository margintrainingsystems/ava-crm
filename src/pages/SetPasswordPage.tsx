import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { Brand } from '../components/Brand'
import { LoadingScreen } from '../components/StatusScreens'
import { useToast } from '../components/Toast'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { PASSWORD_MIN_LENGTH, passwordProblem } from '../lib/validation'

// Error que Supabase deja en la URL cuando el link de la invitación o de recuperación venció.
export function linkErrorFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (!params.get('error') && !params.get('error_code')) return null
  if (params.get('error_code') === 'otp_expired') return 'El link venció o ya se usó.'
  return 'El link no es válido.'
}

export function SetPasswordPage() {
  const { state } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [linkError] = useState(() => linkErrorFromHash(window.location.hash))
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (state.status === 'loading') return <LoadingScreen />

  if (state.status !== 'ready') {
    return (
      <main className="auth-page">
        <div className="auth-card stack-md">
          <Brand />
          <h1 className="h-lg">{linkError ?? 'Necesitás un link nuevo'}</h1>
          <p className="text-muted">
            Pedí un link nuevo con tu email. Si te invitaron y el link venció, pedile a la propietaria que te reenvíe la
            invitación.
          </p>
          <div className="form-actions">
            <Link to="/recuperar" className="btn btn-solid">
              Pedir un link nuevo
            </Link>
            <Link to="/ingresar" className="btn btn-ghost">
              Ir a entrar
            </Link>
          </div>
        </div>
      </main>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password, confirmation)
    setError(problem)
    if (problem) return
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      setError(errorMessage(updateError, 'No pudimos guardar la contraseña. Probá de nuevo.'))
      return
    }
    toast.show('Guardamos tu contraseña.')
    navigate('/', { replace: true })
  }

  return (
    <main className="auth-page">
      <div className="auth-card stack-md">
        <Brand />
        <div className="stack-sm">
          <h1 className="h-lg">Creá tu contraseña</h1>
          <p className="text-muted">
            Cuenta: <strong>{state.member.email}</strong>
          </p>
        </div>
        <form className="stack-sm" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="new-password">Contraseña nueva</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-describedby="password-help"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p id="password-help" className="field-help">
              Al menos {PASSWORD_MIN_LENGTH} caracteres, con letras y números. No uses la misma contraseña de otro sitio.
            </p>
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Repetí la contraseña</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="form-note form-note-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-solid" disabled={busy} aria-busy={busy}>
            {busy ? 'Guardando…' : 'Guardar y entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
