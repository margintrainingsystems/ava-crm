import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { SubscriptionsPage, openDeadlines } from './SubscriptionsPage'
import type { Enrollment, Subscription, SubscriptionDetail } from '../lib/billing'

const api = vi.hoisted(() => ({
  fetchSubscriptions: vi.fn(),
  fetchSubscription: vi.fn(),
  fetchEnrollment: vi.fn(),
  fetchMasters: vi.fn(),
  registerPayment: vi.fn(),
  cancelSubscription: vi.fn(),
  refundPayment: vi.fn(),
}))
const crm = vi.hoisted(() => ({ fetchPeople: vi.fn() }))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/billing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/billing')>()),
  ...api,
}))
vi.mock('../lib/crm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/crm')>()),
  ...crm,
}))

const enrollment: Enrollment = {
  enrollments_open: true, capacity: 60, opened_at: '2026-09-01T12:00:00Z', active_plans: 12,
  site_url: 'https://aprendeconava.com', updated_at: '2026-09-28T12:00:00Z', updated_by_email: null,
}

function sub(partial: Partial<Subscription>): Subscription {
  return {
    id: 's1', code: 'SUS-ABC', person_id: 'p1', person_name: 'Ana Pérez', kind: 'plan', master_id: null,
    product: 'Suscripción anual', status: 'activa', provider: 'mercadopago', currency: 'ARS',
    started_at: '2026-09-20T12:00:00Z', current_period_end: '2027-09-20T12:00:00Z', auto_renew: true,
    renewal_amount: null, renewal_notice_for: null, beca: false, last_payment_at: '2026-09-20T12:00:00Z',
    guarantee_until: '2026-10-05', withdrawal_until: '2026-10-01', days_to_end: 357,
    ...partial,
  }
}

const detail: SubscriptionDetail = {
  id: 's1', code: 'SUS-ABC', person_id: 'p1', person_name: 'Ana Pérez', kind: 'plan', product: 'Suscripción anual',
  status: 'activa', provider: 'mercadopago', provider_ref: null, currency: 'ARS', started_at: '2026-09-20T12:00:00Z',
  current_period_start: '2026-09-20T12:00:00Z', current_period_end: '2027-09-20T12:00:00Z', auto_renew: true,
  cancel_requested_at: null, ended_at: null, renewal_amount: null, renewal_notice_for: null, beca: false, notes: null,
  created_by_email: 'ana@example.com',
  payments: [
    {
      id: 'y1', kind: 'alta', provider: 'mercadopago', provider_payment_id: 'MP-1', amount: 626000, currency: 'ARS',
      usd_list_price: 400, fx_rate: 1565, beca: false, status: 'aprobado', paid_at: '2026-09-20T12:00:00Z',
      period_start: '2026-09-20T12:00:00Z', period_end: '2027-09-20T12:00:00Z', guarantee_until: '2026-10-05',
      withdrawal_until: '2026-10-01', refunded_amount: null, refunded_at: null, refund_reason: null, refund_note: null,
      recorded_by_email: null,
    },
  ],
}

describe('openDeadlines', () => {
  it('muestra solo los plazos que siguen abiertos', () => {
    expect(openDeadlines({ guarantee_until: '2026-10-05', withdrawal_until: '2026-10-01' }, '2026-09-28')).toEqual([
      'En garantía hasta el lunes 5 de octubre de 2026',
      'Puede arrepentirse hasta el jueves 1 de octubre de 2026',
    ])
    expect(openDeadlines({ guarantee_until: '2026-10-05', withdrawal_until: '2026-10-01' }, '2026-10-03')).toHaveLength(1)
    expect(openDeadlines({ guarantee_until: null, withdrawal_until: null }, '2026-10-03')).toEqual([])
  })
})

describe('SubscriptionsPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    crm.fetchPeople.mockReset()
    api.fetchEnrollment.mockResolvedValue(enrollment)
    api.fetchMasters.mockResolvedValue([{ id: 'm1', name: 'Datos y Análisis', price: 175 }])
    api.fetchSubscription.mockResolvedValue(detail)
    crm.fetchPeople.mockResolvedValue([{ id: 'p1', first_name: 'Ana', last_name: 'Pérez', email: 'ana@example.com' }])
  })

  it('lista por estado y muestra el cupo', async () => {
    api.fetchSubscriptions.mockResolvedValue([sub({}), sub({ id: 's2', person_name: 'Bruno Díaz', status: 'cancelada' })])
    renderWithAuth(<SubscriptionsPage />, readyState({}, ['suscripciones.ver']))
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('12 de 60')).toBeInTheDocument()
    expect(screen.queryByText('Bruno Díaz')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar un cobro' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Dadas de baja/ }))
    expect(screen.getByText('Bruno Díaz')).toBeInTheDocument()
  })

  it('abre la suscripción del enlace en su pestaña, con los cobros', async () => {
    api.fetchSubscriptions.mockResolvedValue([sub({ status: 'cancelada' })])
    renderWithAuth(<SubscriptionsPage />, readyState({}, ['suscripciones.ver', 'pagos.ver']), '/suscripciones?suscripcion=s1')
    expect(await screen.findByText('$ 626.000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dadas de baja/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Dólar blue: $ 1.565')).toBeInTheDocument()
  })

  it('pide persona y monto antes de registrar un cobro', async () => {
    api.fetchSubscriptions.mockResolvedValue([])
    api.registerPayment.mockResolvedValue('s9')
    renderWithAuth(<SubscriptionsPage />, readyState({}, ['suscripciones.ver', 'suscripciones.gestionar', 'personas.ver']))
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar un cobro' }))
    const form = screen.getByRole('heading', { name: 'Registrar un cobro' }).closest('form') as HTMLFormElement
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Elegí a la persona.')
    await screen.findByRole('option', { name: /Ana Pérez/ })
    await userEvent.selectOptions(within(form).getByLabelText('Persona'), 'p1')
    await userEvent.type(within(form).getByLabelText('Monto cobrado'), '626.000')
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar' }))
    expect(api.registerPayment).toHaveBeenCalledWith(
      expect.objectContaining({ personId: 'p1', kind: 'plan', masterId: null, amount: 626000, currency: 'ARS', provider: 'mercadopago' }),
    )
  })

  it('con el enlace del sorteo, registra el alta con la beca', async () => {
    api.fetchSubscriptions.mockResolvedValue([])
    api.registerPayment.mockResolvedValue('s9')
    renderWithAuth(
      <SubscriptionsPage />,
      readyState({}, ['suscripciones.ver', 'suscripciones.gestionar', 'personas.ver']),
      '/suscripciones?beca=k1&persona=p1',
    )
    expect(await screen.findByRole('heading', { name: 'Registrar el alta con beca' })).toBeInTheDocument()
    expect(screen.getByLabelText('Persona')).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Monto cobrado'), '313.000')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }))
    expect(api.registerPayment).toHaveBeenCalledWith(expect.objectContaining({ personId: 'p1', becaPickId: 'k1', amount: 313000 }))
  })
})
