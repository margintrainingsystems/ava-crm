import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { RetentionPage, purgeSummary } from './RetentionPage'
import type { ExpiredLead } from '../lib/compliance'

const api = vi.hoisted(() => ({ fetchExpired: vi.fn(), purgeExpired: vi.fn(), notifyMessagesChanged: vi.fn() }))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/compliance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/compliance')>()),
  fetchExpired: api.fetchExpired,
  purgeExpired: api.purgeExpired,
}))
vi.mock('../lib/crm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/crm')>()),
  notifyMessagesChanged: api.notifyMessagesChanged,
}))

const lead = (partial: Partial<ExpiredLead>): ExpiredLead => ({
  id: 'l1', person_id: 'p1', first_name: 'Ana', last_name: 'Pérez', source: 'contacto', request_code: null,
  created_at: '2024-01-10T12:00:00Z', expires_at: '2026-01-10T12:00:00Z', ...partial,
})

describe('RetentionPage', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

  it('borra solo los formularios elegidos después de confirmar', async () => {
    api.fetchExpired.mockResolvedValueOnce([lead({}), lead({ id: 'l2', first_name: 'Bea', source: 'baja', request_code: 'BAJ-X' })])
    api.fetchExpired.mockResolvedValueOnce([])
    api.purgeExpired.mockResolvedValue({ mensajes: 2, personas: 1 })
    renderWithAuth(<RetentionPage />, readyState({}, ['personas.borrar']))

    const borrar = await screen.findByRole('button', { name: 'Borrar' })
    expect(borrar).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Elegir los 2'))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar 2 formularios' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar' }))

    expect(api.purgeExpired).toHaveBeenCalledWith(['l1', 'l2'])
    expect(await screen.findByText('No hay formularios vencidos.')).toBeInTheDocument()
    expect(screen.getByText('Borraste 2 formularios vencidos y 1 persona que quedó sin formularios.')).toBeInTheDocument()
  })

  it('sin permiso para ver personas, el nombre no es un link', async () => {
    api.fetchExpired.mockResolvedValue([lead({})])
    renderWithAuth(<RetentionPage />, readyState({}, ['personas.borrar']))
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ana Pérez' })).not.toBeInTheDocument()
  })

  it('resume lo que se borró', () => {
    expect(purgeSummary({ mensajes: 1, personas: 0 })).toBe('Borraste 1 formulario vencido.')
    expect(purgeSummary({ mensajes: 0, personas: 0 })).toMatch(/No se borró nada/)
  })
})
