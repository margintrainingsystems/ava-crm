import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { AppLayout, visibleNav } from './AppLayout'

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))

describe('visibleNav', () => {
  it('muestra todo a la propietaria', () => {
    expect(visibleNav({ isOwner: true, permissions: new Set() }).map((i) => i.to)).toEqual([
      '/',
      '/mensajes',
      '/personas',
      '/suscripciones',
      '/pagos',
      '/sorteo',
      '/pedidos-de-datos',
      '/emails',
      '/retencion',
      '/configuracion',
    ])
  })

  it('muestra solo lo permitido al resto', () => {
    expect(visibleNav({ isOwner: false, permissions: new Set() }).map((i) => i.to)).toEqual(['/'])
    expect(visibleNav({ isOwner: false, permissions: new Set(['personas.ver']) }).map((i) => i.to)).toEqual([
      '/',
      '/personas',
    ])
    expect(visibleNav({ isOwner: false, permissions: new Set(['pedidos.gestionar']) }).map((i) => i.to)).toEqual([
      '/',
      '/mensajes',
      '/emails',
    ])
    expect(visibleNav({ isOwner: false, permissions: new Set(['configuracion.editar']) }).map((i) => i.to)).toEqual([
      '/',
      '/configuracion',
    ])
    expect(
      visibleNav({ isOwner: false, permissions: new Set(['derechos.gestionar', 'personas.borrar']) }).map((i) => i.to),
    ).toEqual(['/', '/pedidos-de-datos', '/retencion'])
    expect(visibleNav({ isOwner: false, permissions: new Set(['reportes.ver']) }).map((i) => i.to)).toEqual(['/', '/pagos'])
    expect(
      visibleNav({ isOwner: false, permissions: new Set(['suscripciones.ver', 'sorteo.gestionar']) }).map((i) => i.to),
    ).toEqual(['/', '/suscripciones', '/sorteo'])
  })
})

describe('AppLayout', () => {
  it('muestra el nombre, el rol y abre el menú en el celular', async () => {
    renderWithAuth(
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<h1>Inicio</h1>} />
        </Route>
      </Routes>,
      readyState(),
    )
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Docente')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Equipo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Administrar en Núcleo/ })).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: 'Abrir menú' })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
