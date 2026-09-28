import { screen } from '@testing-library/react'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { HomePage, hasPending } from './HomePage'
import type { Today } from '../lib/compliance'

const api = vi.hoisted(() => ({ fetchToday: vi.fn(), fetchPermissions: vi.fn() }))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/queries', () => ({ fetchPermissions: api.fetchPermissions }))
vi.mock('../lib/compliance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/compliance')>()),
  fetchToday: api.fetchToday,
}))

const base: Today = { today: '2026-09-28' }

describe('HomePage (Hoy)', () => {
  beforeEach(() => {
    api.fetchToday.mockReset()
    api.fetchPermissions.mockResolvedValue([])
  })

  it('muestra los plazos que ve el rol, ordenados por urgencia', async () => {
    api.fetchToday.mockResolvedValue({
      ...base,
      requests: [
        {
          id: 'r1', source: 'baja', request_code: 'BAJ-ABC123', name: 'Ana', created_at: '2026-09-28T10:00:00Z',
          deadline: '2999-01-01T00:00:00Z',
        },
      ],
      data_requests: [
        {
          id: 'd1', code: 'DAT-XYZ234', kind: 'supresion', name: 'Bea Gómez', due_date: '2026-10-05', days_left: 7,
          identity_verified: false,
        },
      ],
      missing_holiday_years: [],
    } satisfies Today)
    renderWithAuth(<HomePage />, readyState({}, ['pedidos.gestionar', 'derechos.gestionar']))

    expect(await screen.findByText('Hoy es lunes 28 de septiembre de 2026.', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Baja · BAJ-ABC123/ })).toHaveAttribute('href', '/mensajes?mensaje=r1')
    expect(screen.getByRole('link', { name: /Supresión · DAT-XYZ234/ })).toHaveAttribute(
      'href',
      '/pedidos-de-datos?pedido=d1',
    )
    expect(screen.getByText('Vence en 7 días')).toBeInTheDocument()
    expect(screen.getByText(/identidad sin verificar/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mensajes sin leer' })).not.toBeInTheDocument()
  })

  it('avisa que faltan feriados y le indica a quién pedírselos', async () => {
    api.fetchToday.mockResolvedValue({ ...base, data_requests: [], missing_holiday_years: [2026] })
    renderWithAuth(<HomePage />, readyState({}, ['derechos.gestionar']))
    expect(await screen.findByText('Faltan los feriados de 2026.')).toBeInTheDocument()
    expect(screen.getByText(/Avisale a la propietaria/)).toBeInTheDocument()
  })

  it('a la propietaria le ofrece cargarlos en Núcleo', async () => {
    api.fetchToday.mockResolvedValue({ ...base, data_requests: [], missing_holiday_years: [2026, 2027] })
    renderWithAuth(<HomePage />, readyState({}, [], true))
    expect(await screen.findByText('Faltan los feriados de 2026 y 2027.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Cargalos en Núcleo/ })).toHaveAttribute(
      'href',
      'https://ava-nucleo.netlify.app/feriados.html',
    )
  })

  it('dice que está todo al día cuando no hay nada pendiente', async () => {
    api.fetchToday.mockResolvedValue({ ...base, unread: [], unread_count: 0 })
    renderWithAuth(<HomePage />, readyState({}, ['mensajes.ver']))
    expect(await screen.findByText('Todo al día: no hay nada pendiente en tus secciones.')).toBeInTheDocument()
  })

  it('reconoce lo pendiente', () => {
    expect(hasPending(base)).toBe(false)
    expect(hasPending({ ...base, expired_count: 2 })).toBe(true)
    expect(hasPending({ ...base, requests: [], data_requests: [], unread_count: 0 })).toBe(false)
  })
})
