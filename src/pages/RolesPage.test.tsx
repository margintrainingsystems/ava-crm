import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { RolesPage } from './RolesPage'
import type { RoleSummary } from '../lib/queries'

const mocks = vi.hoisted(() => ({
  fetchRoles: vi.fn(),
  fetchPermissions: vi.fn(),
  saveRole: vi.fn(),
  deleteRole: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/queries', () => mocks)

const permissions = [
  { key: 'mensajes.ver', area: 'Mensajes', label: 'Ver mensajes', description: 'Ver lo que llega.', sort_order: 110 },
  { key: 'pagos.ver', area: 'Suscripciones', label: 'Ver pagos', description: 'Montos y monedas.', sort_order: 330 },
]

const docente: RoleSummary = {
  id: 'r1',
  name: 'Docente',
  description: 'Da clases',
  permissionKeys: ['mensajes.ver'],
  memberCount: 2,
}

describe('RolesPage', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset())
    mocks.fetchPermissions.mockResolvedValue(permissions)
  })

  it('invita a crear el primer rol', async () => {
    mocks.fetchRoles.mockResolvedValue([])
    renderWithAuth(<RolesPage />, readyState({}, [], true))
    expect(await screen.findByText('Todavía no hay roles')).toBeInTheDocument()
  })

  it('no ofrece borrar un rol que tiene personas', async () => {
    mocks.fetchRoles.mockResolvedValue([docente, { ...docente, id: 'r2', name: 'Atención', memberCount: 0 }])
    renderWithAuth(<RolesPage />, readyState({}, [], true))
    expect(await screen.findByText('Docente')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrar el rol Docente' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Borrar el rol Atención' })).toBeInTheDocument()
    expect(screen.getByText(/primero asigná otro rol/)).toBeInTheDocument()
  })

  it('crea un rol con los permisos marcados', async () => {
    mocks.fetchRoles.mockResolvedValue([])
    mocks.saveRole.mockResolvedValue('nuevo')
    renderWithAuth(<RolesPage />, readyState({}, [], true))
    await userEvent.click(await screen.findByRole('button', { name: 'Crear rol' }))

    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Nombre'), '  Atención  ')
    await userEvent.click(within(dialog).getByLabelText(/Ver pagos/))
    expect(within(dialog).getByText('Sensible')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear rol' }))

    expect(mocks.saveRole).toHaveBeenCalledWith({
      id: null,
      name: 'Atención',
      description: '',
      permissionKeys: ['pagos.ver'],
    })
    expect(await screen.findByText('Creaste el rol "Atención".')).toBeInTheDocument()
  })

  it('avisa si el nombre ya existe', async () => {
    mocks.fetchRoles.mockResolvedValue([])
    mocks.saveRole.mockRejectedValue({ code: '23505' })
    renderWithAuth(<RolesPage />, readyState({}, [], true))
    await userEvent.click(await screen.findByRole('button', { name: 'Crear rol' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Docente')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear rol' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ya existe un rol con ese nombre.')
  })

  it('pide un nombre', async () => {
    mocks.fetchRoles.mockResolvedValue([])
    renderWithAuth(<RolesPage />, readyState({}, [], true))
    await userEvent.click(await screen.findByRole('button', { name: 'Crear rol' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear rol' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Poné un nombre al rol.')
    expect(mocks.saveRole).not.toHaveBeenCalled()
  })
})
