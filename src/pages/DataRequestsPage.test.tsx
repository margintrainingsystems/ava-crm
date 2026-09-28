import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { DataRequestsPage, requesterLabel } from './DataRequestsPage'
import type { DataRequest } from '../lib/compliance'

const api = vi.hoisted(() => ({
  fetchDataRequests: vi.fn(),
  createDataRequest: vi.fn(),
  updateDataRequest: vi.fn(),
  closeDataRequest: vi.fn(),
  fetchPeople: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/compliance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/compliance')>()),
  fetchDataRequests: api.fetchDataRequests,
  createDataRequest: api.createDataRequest,
  updateDataRequest: api.updateDataRequest,
  closeDataRequest: api.closeDataRequest,
}))
vi.mock('../lib/crm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/crm')>()),
  fetchPeople: api.fetchPeople,
}))

function req(partial: Partial<DataRequest>): DataRequest {
  return {
    id: 'd1', code: 'DAT-ABC234', kind: 'acceso', person_id: 'p1', person_name: 'Ana Pérez', requester_name: 'Ana Pérez',
    requester_email: 'ana@example.com', contact_hidden: false, channel: 'email', detail: 'Pide sus datos',
    received_at: '2026-09-28T12:00:00Z', due_date: '2026-10-08', days_left: 10, missing_holiday_years: [],
    identity_verified: false, status: 'pendiente', resolved_at: null, resolved_on_time: null, resolution_note: null,
    previous_access_at: null, created_by_email: 'equipo@example.com', ...partial,
  }
}

describe('DataRequestsPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    api.fetchPeople.mockResolvedValue([])
  })

  it('separa pendientes y cerrados y muestra el plazo', async () => {
    api.fetchDataRequests.mockResolvedValue([
      req({}),
      req({ id: 'd2', code: 'DAT-QQQ222', status: 'respondido', resolved_at: '2026-09-20T12:00:00Z', resolved_on_time: false }),
    ])
    renderWithAuth(<DataRequestsPage />, readyState({}, ['derechos.gestionar']))
    expect(await screen.findByText('Vence en 10 días (jueves 8 de octubre de 2026)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pendientes/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /^Cerrados/ }))
    expect(screen.getByText(/fuera de plazo/)).toBeInTheDocument()
  })

  it('abre el pedido que llega en el link y avisa si faltan feriados o si pidió acceso hace poco', async () => {
    api.fetchDataRequests.mockResolvedValue([
      req({ kind: 'supresion', missing_holiday_years: [2026], previous_access_at: null }),
      req({ id: 'd3', previous_access_at: '2026-06-01T12:00:00Z' }),
    ])
    renderWithAuth(<DataRequestsPage />, readyState({}, ['derechos.gestionar']), '/pedidos-de-datos?pedido=d3')
    expect(await screen.findByText(/hace menos de seis meses/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /Ana Pérez/ })[0]!)
    expect(screen.getByText(/Faltan cargar los feriados de 2026/)).toBeInTheDocument()
  })

  it('pide un motivo para anular y cierra con la nota', async () => {
    api.fetchDataRequests.mockResolvedValue([req({})])
    api.closeDataRequest.mockResolvedValue(undefined)
    renderWithAuth(<DataRequestsPage />, readyState({}, ['derechos.gestionar']), '/pedidos-de-datos?pedido=d1')
    await userEvent.click(await screen.findByRole('button', { name: 'Anular' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Contá por qué se anula el pedido.')
    expect(api.closeDataRequest).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Nota de cierre'), 'Le mandamos el archivo')
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como respondido' }))
    expect(api.closeDataRequest).toHaveBeenCalledWith('d1', 'respondido', 'Le mandamos el archivo')
  })

  it('no deja cerrar con cambios sin guardar', async () => {
    api.fetchDataRequests.mockResolvedValue([req({})])
    renderWithAuth(<DataRequestsPage />, readyState({}, ['derechos.gestionar']), '/pedidos-de-datos?pedido=d1')
    await userEvent.click(await screen.findByLabelText(/Verificamos que el pedido/))
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como respondido' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Guardá los cambios del pedido antes de cerrarlo.')
    api.updateDataRequest.mockResolvedValue(undefined)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(api.updateDataRequest).toHaveBeenCalledWith('d1', true, 'Pide sus datos')
  })

  it('registra un pedido de alguien que no está en el CRM', async () => {
    api.fetchDataRequests.mockResolvedValue([])
    api.createDataRequest.mockResolvedValue({ id: 'nuevo', code: 'DAT-NEW234', due_date: '2026-10-05' })
    renderWithAuth(<DataRequestsPage />, readyState({}, ['derechos.gestionar', 'personas.ver_contacto']))
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar un pedido' }))
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pedido' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Elegí a la persona o escribí su nombre o email.')

    await userEvent.click(screen.getByLabelText(/Supresión/))
    await userEvent.type(screen.getByLabelText('Email'), 'bea@example.com')
    const when = screen.getByLabelText('Cuándo llegó (hora de Buenos Aires)')
    await userEvent.clear(when)
    await userEvent.type(when, '2026-09-28T09:30')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pedido' }))
    expect(api.createDataRequest).toHaveBeenCalledWith({
      kind: 'supresion',
      receivedAt: '2026-09-28T12:30:00.000Z',
      personId: null,
      requesterName: '',
      requesterEmail: 'bea@example.com',
      channel: 'email',
      detail: '',
    })
    // Sin permiso para ver personas no aparece el selector.
    expect(screen.queryByLabelText('Persona')).not.toBeInTheDocument()
  })

  it('arma el nombre de quien pidió sin mostrar el email oculto', () => {
    expect(requesterLabel({ person_name: null, requester_name: null, requester_email: null, contact_hidden: true })).toBe(
      'Sin nombre',
    )
    expect(
      requesterLabel({ person_name: null, requester_name: null, requester_email: 'x@example.com', contact_hidden: false }),
    ).toBe('x@example.com')
  })
})
