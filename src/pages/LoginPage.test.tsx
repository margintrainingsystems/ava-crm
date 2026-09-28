import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithAuth } from '../test/renderWithAuth'
import { LoginPage } from './LoginPage'

const signInWithPassword = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: (...args: unknown[]) => signInWithPassword(...args) } },
  clearStoredSession: vi.fn(),
}))

describe('LoginPage', () => {
  beforeEach(() => signInWithPassword.mockReset())

  it('muestra el aviso que dejó el cierre de sesión', () => {
    renderWithAuth(<LoginPage />, { status: 'signed_out', notice: 'Cerramos tu sesión por inactividad.' })
    expect(screen.getByText('Cerramos tu sesión por inactividad.')).toBeInTheDocument()
  })

  it('valida el email antes de llamar a Supabase', async () => {
    renderWithAuth(<LoginPage />, { status: 'signed_out' })
    await userEvent.type(screen.getByLabelText('Email'), 'no-es-un-email')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'algo')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Revisá el email')
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('normaliza el email y traduce el error de credenciales', async () => {
    signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400 } })
    renderWithAuth(<LoginPage />, { status: 'signed_out' })
    await userEvent.type(screen.getByLabelText('Email'), ' Ana@Example.com ')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave12345a')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'clave12345a' })
    expect(await screen.findByRole('alert')).toHaveTextContent('El email o la contraseña no coinciden.')
  })

  it('muestra y oculta la contraseña', async () => {
    renderWithAuth(<LoginPage />, { status: 'signed_out' })
    const input = screen.getByLabelText('Contraseña')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
    expect(input).toHaveAttribute('type', 'text')
  })
})
