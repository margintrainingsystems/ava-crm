import { drawnNumbers, formatMoney, monthRange, parseArsNumber, paymentsCsvRows, type PaymentListItem } from './billing'

vi.mock('./supabase', () => ({ supabase: {} }))

describe('formatMoney', () => {
  it('escribe pesos sin decimales y dólares con dos', () => {
    expect(formatMoney(626000, 'ARS')).toBe('$ 626.000')
    expect(formatMoney(400, 'USD')).toBe('USD 400,00')
    expect(formatMoney(null, 'ARS')).toBe('—')
  })
})

describe('parseArsNumber', () => {
  it('entiende cómo se escriben los números en Argentina', () => {
    expect(parseArsNumber('1565')).toBe(1565)
    expect(parseArsNumber('1.565')).toBe(1565)
    expect(parseArsNumber('$ 626.000')).toBe(626000)
    expect(parseArsNumber('1.565,50')).toBe(1565.5)
    expect(parseArsNumber('175.5')).toBe(175.5)
  })

  it('rechaza lo que no es un monto', () => {
    expect(parseArsNumber('')).toBeNull()
    expect(parseArsNumber('abc')).toBeNull()
    expect(parseArsNumber('0')).toBeNull()
    expect(parseArsNumber('-5')).toBeNull()
  })
})

describe('drawnNumbers', () => {
  it('ordena titulares y suplentes por posición', () => {
    const pick = (position: number, role: 'titular' | 'suplente', number: number) =>
      ({ position, role, number }) as Parameters<typeof drawnNumbers>[0]['picks'][number]
    expect(drawnNumbers({ picks: [pick(4, 'suplente', 9), pick(2, 'titular', 3), pick(1, 'titular', 7)] })).toEqual({
      titulares: [7, 3],
      suplentes: [9],
    })
  })
})

describe('monthRange', () => {
  it('va del primer día del mes a hoy', () => {
    expect(monthRange('2026-09-28')).toEqual({ from: '2026-09-01', to: '2026-09-28' })
  })
})

describe('paymentsCsvRows', () => {
  it('usa la fecha de Buenos Aires y montos con coma decimal', () => {
    const row = {
      id: 'y1', subscription_id: 's1', code: 'SUS-ABC', person_id: 'p1', person_name: 'Ana Pérez', product: 'Suscripción anual',
      kind: 'alta', provider: 'mercadopago', provider_payment_id: 'MP-1', amount: 626000.5, currency: 'ARS', fx_rate: 1565,
      beca: false, status: 'aprobado', paid_at: '2026-10-01T01:30:00Z', refunded_amount: 0, guarantee_until: null,
      withdrawal_until: '2026-10-13',
    } as PaymentListItem
    const csv = paymentsCsvRows([row])
    expect(csv.header[0]).toBe('Fecha')
    expect(csv.rows[0]).toEqual([
      '2026-09-30', 'SUS-ABC', 'Ana Pérez', 'Suscripción anual', 'Alta', 'Mercado Pago', 'MP-1', 'ARS', '626000,5', '0', '1565',
      'No', 'Cobrado',
    ])
  })
})
