import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { PaymentsPage } from './PaymentsPage'
import type { PaymentListItem } from '../lib/billing'

const api = vi.hoisted(() => ({ fetchPaymentsReport: vi.fn(), fetchPayments: vi.fn() }))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/billing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/billing')>()),
  ...api,
}))

const report = [
  { currency: 'ARS', payments: 2, gross: 1252000, refunded: 0, net: 1252000, becas: 0 },
  { currency: 'USD', payments: 3, gross: 775, refunded: 400, net: 375, becas: 1 },
]

const payment = {
  id: 'y1', subscription_id: 's1', code: 'SUS-ABC', person_id: 'p1', person_name: 'Ana Pérez', product: 'Suscripción anual',
  kind: 'alta', provider: 'mercadopago', provider_payment_id: 'MP-1', amount: 626000, currency: 'ARS', fx_rate: 1565,
  beca: false, status: 'aprobado', paid_at: '2026-09-20T12:00:00Z', refunded_amount: 0, guarantee_until: '2026-10-05',
  withdrawal_until: '2026-10-01',
} as PaymentListItem

describe('PaymentsPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    api.fetchPaymentsReport.mockResolvedValue(report)
    api.fetchPayments.mockResolvedValue([payment])
  })

  it('suma cada moneda por separado y muestra cada cobro a quien ve pagos', async () => {
    renderWithAuth(<PaymentsPage />, readyState({}, ['pagos.ver']))
    expect(await screen.findByText('$ 1.252.000', { selector: '.cell-strong' })).toBeInTheDocument()
    expect(screen.getByText('USD 375,00')).toBeInTheDocument()
    expect(screen.getByText('1 con beca')).toBeInTheDocument()
    expect(screen.getByText('Cada moneda se suma por separado: no convertimos una en la otra.')).toBeInTheDocument()
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeInTheDocument()
  })

  it('con solo reportes, muestra los totales sin el detalle', async () => {
    renderWithAuth(<PaymentsPage />, readyState({}, ['reportes.ver']))
    expect(await screen.findByText('USD 375,00')).toBeInTheDocument()
    expect(api.fetchPayments).not.toHaveBeenCalled()
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
  })

  it('no busca con fechas al revés', async () => {
    renderWithAuth(<PaymentsPage />, readyState({}, ['reportes.ver']))
    await screen.findByText('USD 375,00')
    const from = screen.getByLabelText('Desde')
    await userEvent.clear(from)
    await userEvent.type(from, '2030-01-01')
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Revisá las fechas')
    expect(api.fetchPaymentsReport).toHaveBeenCalledTimes(1)
  })
})
