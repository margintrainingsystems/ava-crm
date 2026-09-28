import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { RafflePage, pickHint } from './RafflePage'
import type { Raffle, RafflePick, RaffleView } from '../lib/billing'

const api = vi.hoisted(() => ({
  fetchRaffles: vi.fn(),
  prepareRaffle: vi.fn(),
  drawRaffle: vi.fn(),
  notifyPick: vi.fn(),
  resolvePick: vi.fn(),
  closeRaffle: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/billing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/billing')>()),
  ...api,
}))

function pick(partial: Partial<RafflePick>): RafflePick {
  return {
    id: 'k1', position: 1, role: 'titular', number: 7, status: 'por_avisar', person_id: 'p1', name: 'Ana Pérez',
    public_name: null, notified_at: null, respond_by: null, beca_until: null, resolved_at: null, subscription_id: null,
    ...partial,
  }
}

function raffle(partial: Partial<Raffle>): Raffle {
  return {
    id: 'r1', status: 'preparado', scheduled_for: '2026-10-05', winners: 3, substitutes: 3, discount_percent: 50,
    entries_count: 40, entries_digest: 'a'.repeat(64), created_at: '2026-10-01T12:00:00Z', created_by_email: 'ana@example.com',
    drawn_at: null, drawn_by_email: null, closed_at: null, draws: [], picks: [],
    ...partial,
  }
}

const view = (partial: Partial<RaffleView>): RaffleView => ({
  enrollments_open: true, opened_at: '2026-10-01T12:00:00Z', waitlist_count: 40, raffles: [], ...partial,
})

describe('pickHint', () => {
  it('explica qué falta con cada persona', () => {
    expect(pickHint(pick({ status: 'avisada', respond_by: '2026-10-08' }), '2026-10-05')).toMatch(/^Tiene hasta el/)
    expect(pickHint(pick({ status: 'avisada', respond_by: '2026-10-08' }), '2026-10-09')).toMatch(/^Pasó el plazo/)
    expect(pickHint(pick({ status: 'acepto', subscription_id: 's1' }), '2026-10-09')).toBe('Ya contrató con la beca.')
    expect(pickHint(pick({ status: 'rechazo' }), '2026-10-09')).toBe('La beca pasó al suplente siguiente.')
  })
})

describe('RafflePage', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

  it('no numera la lista antes de la primera apertura', async () => {
    api.fetchRaffles.mockResolvedValue(view({ enrollments_open: false, opened_at: null }))
    renderWithAuth(<RafflePage />, readyState({}, ['sorteo.gestionar']))
    expect(await screen.findByText(/Las inscripciones todavía no se abrieron/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Numerar la lista' })).toBeDisabled()
  })

  it('no deja sortear con las inscripciones cerradas', async () => {
    api.fetchRaffles.mockResolvedValue(view({ enrollments_open: false, raffles: [raffle({})] }))
    renderWithAuth(<RafflePage />, readyState({}, ['sorteo.gestionar']))
    expect(await screen.findByRole('button', { name: 'Sortear' })).toBeDisabled()
    expect(screen.getByText(/Abrilas desde Configuración/)).toBeInTheDocument()
  })

  it('sortea con confirmación y abre la pantalla con solo números', async () => {
    api.fetchRaffles.mockResolvedValueOnce(view({ raffles: [raffle({})] })).mockResolvedValue(
      view({
        raffles: [
          raffle({
            status: 'sorteado',
            drawn_at: '2026-10-05T15:00:00Z',
            draws: [
              { attempt: 1, number: 7, repeated: false },
              { attempt: 2, number: 7, repeated: true },
              { attempt: 3, number: 12, repeated: false },
            ],
            picks: [pick({}), pick({ id: 'k4', position: 4, role: 'suplente', number: 12, status: 'en_espera', name: 'Bruno Díaz' })],
          }),
        ],
      }),
    )
    api.drawRaffle.mockResolvedValue(undefined)
    renderWithAuth(<RafflePage />, readyState({}, ['sorteo.gestionar', 'personas.ver']))
    await userEvent.click(await screen.findByRole('button', { name: 'Sortear' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sortear ahora' }))
    expect(api.drawRaffle).toHaveBeenCalledWith('r1')
    const screenDialog = await screen.findByRole('dialog', { name: 'Números sorteados' })
    expect(within(screenDialog).getByText('7')).toBeInTheDocument()
    expect(within(screenDialog).getByText('12')).toBeInTheDocument()
    expect(within(screenDialog).queryByText('Ana Pérez')).not.toBeInTheDocument()
    expect(screen.getByText('Intento 2: número 7 (repetido, se volvió a sortear)')).toBeInTheDocument()
  })

  it('avisa, registra respuestas y lleva al alta con beca', async () => {
    api.fetchRaffles.mockResolvedValue(
      view({
        raffles: [
          raffle({
            status: 'sorteado',
            picks: [
              pick({}),
              pick({ id: 'k2', position: 2, number: 3, status: 'avisada', respond_by: '2000-01-01', name: 'Carla Gómez' }),
              pick({ id: 'k3', position: 3, number: 9, status: 'acepto', person_id: 'p3', name: 'Dana Ruiz', public_name: 'Dana R.' }),
            ],
          }),
        ],
      }),
    )
    api.notifyPick.mockResolvedValue(undefined)
    api.resolvePick.mockResolvedValue(undefined)
    renderWithAuth(<RafflePage />, readyState({}, ['sorteo.gestionar', 'personas.ver', 'suscripciones.gestionar']))
    await userEvent.click(await screen.findByRole('button', { name: 'Avisar por email' }))
    expect(api.notifyPick).toHaveBeenCalledWith('k1')
    await userEvent.click(screen.getByRole('button', { name: 'No respondió' }))
    expect(api.resolvePick).toHaveBeenCalledWith('k2', 'sin_respuesta')
    expect(screen.getByText('Se puede publicar como Dana R.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Registrar el alta con beca' })).toHaveAttribute(
      'href',
      '/suscripciones?beca=k3&persona=p3',
    )
  })

  it('pide confirmación antes de saltear a quien no se puede avisar', async () => {
    api.fetchRaffles.mockResolvedValue(view({ raffles: [raffle({ status: 'sorteado', picks: [pick({})] })] }))
    api.resolvePick.mockResolvedValue(undefined)
    renderWithAuth(<RafflePage />, readyState({}, ['sorteo.gestionar']))
    await userEvent.click(await screen.findByRole('button', { name: 'No se la puede avisar' }))
    expect(api.resolvePick).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pasar al suplente' }))
    expect(api.resolvePick).toHaveBeenCalledWith('k1', 'sin_respuesta')
  })
})
