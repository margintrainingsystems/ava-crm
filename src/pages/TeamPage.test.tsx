import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { TeamPage } from './TeamPage'
import type { TeamMember } from '../lib/queries'

const queries = vi.hoisted(() => ({
  fetchTeam: vi.fn(),
  fetchRoles: vi.fn(),
  updateMember: vi.fn(),
  removeMember: vi.fn(),
}))
const team = vi.hoisted(() => ({
  fetchMemberStatuses: vi.fn(),
  inviteMember: vi.fn(),
  resendInvitation: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/queries', () => queries)
vi.mock('../lib/team', async (importOriginal) => ({ ...(await importOriginal<object>()), ...team }))

const owner: TeamMember = {
  userId: 'owner',
  email: 'ilearnwithava@gmail.com',
  displayName: 'Aimar Merino',
  isOwner: true,
  active: true,
  roleId: null,
  createdAt: '2026-09-28T00:00:00Z',
}
const ana: TeamMember = {
  userId: 'ana',
  email: 'ana@example.com',
  displayName: 'Ana Pérez',
  isOwner: false,
  active: true,
  roleId: 'r1',
  createdAt: '2026-09-28T01:00:00Z',
}
const role = { id: 'r1', name: 'Docente', description: 'Da clases', permissionKeys: [], memberCount: 1 }

describe('TeamPage', () => {
  beforeEach(() => {
    Object.values(queries).forEach((m) => m.mockReset())
    Object.values(team).forEach((m) => m.mockReset())
  })

  it('pide crear un rol antes de invitar', async () => {
    queries.fetchTeam.mockResolvedValue([owner])
    queries.fetchRoles.mockResolvedValue([])
    team.fetchMemberStatuses.mockResolvedValue(new Map())
    renderWithAuth(<TeamPage />, readyState({}, [], true))
    expect(await screen.findByRole('link', { name: 'Crear un rol' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invitar a una persona' })).toBeDisabled()
  })

  it('muestra a la propietaria y marca las invitaciones pendientes', async () => {
    queries.fetchTeam.mockResolvedValue([owner, ana])
    queries.fetchRoles.mockResolvedValue([role])
    team.fetchMemberStatuses.mockResolvedValue(
      new Map([['ana', { user_id: 'ana', invitada_el: '2026-09-28T01:00:00Z', confirmada: false, ultimo_ingreso: null }]]),
    )
    renderWithAuth(<TeamPage />, readyState({}, [], true))
    expect(await screen.findByText('Propietaria')).toBeInTheDocument()
    expect(screen.getByText('Invitación pendiente')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reenviar la invitación a Ana Pérez' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Quitar del equipo a Aimar/ })).not.toBeInTheDocument()
  })

  it('sigue funcionando si no puede consultar las invitaciones', async () => {
    queries.fetchTeam.mockResolvedValue([owner, ana])
    queries.fetchRoles.mockResolvedValue([role])
    team.fetchMemberStatuses.mockRejectedValue(new Error('sin función'))
    renderWithAuth(<TeamPage />, readyState({}, [], true))
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.queryByText('Invitación pendiente')).not.toBeInTheDocument()
  })

  it('invita con el email normalizado', async () => {
    queries.fetchTeam.mockResolvedValue([owner])
    queries.fetchRoles.mockResolvedValue([role])
    team.fetchMemberStatuses.mockResolvedValue(new Map())
    team.inviteMember.mockResolvedValue({ estado: 'invitada', user_id: 'nuevo' })
    renderWithAuth(<TeamPage />, readyState({}, [], true))

    await userEvent.click(await screen.findByRole('button', { name: 'Invitar a una persona' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Nombre y apellido'), 'Juan Gómez')
    await userEvent.type(within(dialog).getByLabelText('Email'), ' Juan@Example.com ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }))

    expect(team.inviteMember).toHaveBeenCalledWith({ email: 'juan@example.com', display_name: 'Juan Gómez', role_id: 'r1' })
    expect(await screen.findByText('Le enviamos la invitación a juan@example.com.')).toBeInTheDocument()
  })

  it('muestra el mensaje de la función si la invitación falla', async () => {
    queries.fetchTeam.mockResolvedValue([owner])
    queries.fetchRoles.mockResolvedValue([role])
    team.fetchMemberStatuses.mockResolvedValue(new Map())
    team.inviteMember.mockRejectedValue(new Error('Esa persona ya es parte del equipo.'))
    renderWithAuth(<TeamPage />, readyState({}, [], true))

    await userEvent.click(await screen.findByRole('button', { name: 'Invitar a una persona' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Nombre y apellido'), 'Ana')
    await userEvent.type(within(dialog).getByLabelText('Email'), 'ana@example.com')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Esa persona ya es parte del equipo.')
  })

  it('pide confirmación antes de desactivar', async () => {
    queries.fetchTeam.mockResolvedValue([owner, ana])
    queries.fetchRoles.mockResolvedValue([role])
    team.fetchMemberStatuses.mockResolvedValue(new Map())
    queries.updateMember.mockResolvedValue(undefined)
    renderWithAuth(<TeamPage />, readyState({}, [], true))

    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar a Ana Pérez' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/deja de ver el CRM/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }))
    expect(queries.updateMember).toHaveBeenCalledWith('ana', { active: false })
  })
})
