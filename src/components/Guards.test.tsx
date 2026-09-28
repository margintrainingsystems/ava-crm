import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { RequireAccess, RequireAuth } from './Guards'

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))

describe('RequireAccess', () => {
  it('bloquea las secciones de la propietaria al resto del equipo', () => {
    renderWithAuth(<RequireAccess ownerOnly>Secreto</RequireAccess>, readyState())
    expect(screen.queryByText('Secreto')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No tenés acceso a esta sección' })).toBeInTheDocument()
  })

  it('deja pasar con el permiso del rol', () => {
    renderWithAuth(<RequireAccess permission="personas.ver">Personas</RequireAccess>, readyState({}, ['personas.ver']))
    expect(screen.getByText('Personas')).toBeInTheDocument()
  })

  it('deja pasar a la propietaria', () => {
    renderWithAuth(<RequireAccess ownerOnly>Equipo</RequireAccess>, readyState({}, [], true))
    expect(screen.getByText('Equipo')).toBeInTheDocument()
  })
})

describe('RequireAuth', () => {
  it('muestra la carga mientras revisa la sesión', () => {
    renderWithAuth(<RequireAuth>Privado</RequireAuth>, { status: 'loading' })
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(screen.queryByText('Privado')).not.toBeInTheDocument()
  })

  it('manda a entrar sin sesión', () => {
    renderWithAuth(
      <Routes>
        <Route path="/ingresar" element={<p>Pantalla de ingreso</p>} />
        <Route path="/equipo" element={<RequireAuth>Privado</RequireAuth>} />
      </Routes>,
      { status: 'signed_out' },
      '/equipo',
    )
    expect(screen.queryByText('Privado')).not.toBeInTheDocument()
    expect(screen.getByText('Pantalla de ingreso')).toBeInTheDocument()
  })
})
