import type { Database } from './database.types'
import { toLocalInput } from './compliance'
import { supabase } from './supabase'

// Suscripciones, pagos, cupo, cotización del dólar blue y sorteo de becas.
// Las reglas (cupo, plazos, montos) viven en la base; acá se leen y se muestran.

export type Currency = 'ARS' | 'USD'
export type Provider = 'mercadopago' | 'paypal' | 'manual'
export type SubscriptionStatus = 'activa' | 'cancelada' | 'vencida' | 'reembolsada'
export type RefundReason = 'garantia' | 'arrepentimiento' | 'baja_de_master' | 'menor_de_edad' | 'otro'

export const PROVIDER_LABEL: Record<Provider, string> = {
  mercadopago: 'Mercado Pago',
  paypal: 'PayPal',
  manual: 'Registro manual',
}

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  activa: 'Activa',
  cancelada: 'Dada de baja',
  vencida: 'Vencida',
  reembolsada: 'Reembolsada',
}

export const REFUND_REASON_LABEL: Record<RefundReason, string> = {
  garantia: 'Garantía de 15 días',
  arrepentimiento: 'Arrepentimiento',
  baja_de_master: 'Se dio de baja un Máster',
  menor_de_edad: 'Menor de edad',
  otro: 'Otro motivo',
}

const ars = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const usd = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatMoney(amount: number | null | undefined, currency: Currency | string): string {
  if (amount === null || amount === undefined) return '—'
  return currency === 'ARS' ? `$ ${ars.format(amount)}` : `USD ${usd.format(amount)}`
}

// ---------------------------------------------------------------------------
// Suscripciones
// ---------------------------------------------------------------------------
type ListRow = Database['public']['Functions']['crm_subscriptions_list']['Returns'][number]
export type Subscription = Omit<
  ListRow,
  | 'status'
  | 'provider'
  | 'currency'
  | 'master_id'
  | 'person_name'
  | 'renewal_amount'
  | 'renewal_notice_for'
  | 'last_payment_at'
  | 'guarantee_until'
  | 'withdrawal_until'
  | 'kind'
> & {
  kind: 'plan' | 'master'
  status: SubscriptionStatus
  provider: Provider
  currency: Currency
  master_id: string | null
  person_name: string | null
  renewal_amount: number | null
  renewal_notice_for: string | null
  last_payment_at: string | null
  guarantee_until: string | null
  withdrawal_until: string | null
}

export async function fetchSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await supabase.rpc('crm_subscriptions_list')
  if (error) throw error
  return data as Subscription[]
}

export type Payment = {
  id: string
  kind: 'alta' | 'renovacion'
  provider: Provider
  provider_payment_id: string | null
  amount: number | null
  currency: Currency
  usd_list_price: number | null
  fx_rate: number | null
  beca: boolean
  status: 'aprobado' | 'reembolsado' | 'reembolso_parcial'
  paid_at: string
  period_start: string
  period_end: string
  guarantee_until: string | null
  withdrawal_until: string
  refunded_amount: number | null
  refunded_at: string | null
  refund_reason: RefundReason | null
  refund_note: string | null
  recorded_by_email: string | null
}

export type SubscriptionDetail = {
  id: string
  code: string
  person_id: string
  person_name: string | null
  kind: 'plan' | 'master'
  product: string
  status: SubscriptionStatus
  provider: Provider
  provider_ref: string | null
  currency: Currency
  started_at: string
  current_period_start: string
  current_period_end: string
  auto_renew: boolean
  cancel_requested_at: string | null
  ended_at: string | null
  renewal_amount: number | null
  renewal_notice_for: string | null
  beca: boolean
  notes: string | null
  created_by_email: string | null
  payments: Payment[]
}

export async function fetchSubscription(id: string): Promise<SubscriptionDetail> {
  const { data, error } = await supabase.rpc('crm_subscription_detail', { p_id: id })
  if (error) throw error
  return data as unknown as SubscriptionDetail
}

export type NewPayment = {
  personId: string | null
  kind: 'plan' | 'master' | null
  masterId: string | null
  amount: number
  currency: Currency
  paidAt: string
  provider: Provider
  providerPaymentId?: string
  subscriptionId?: string
  becaPickId?: string
}

export async function registerPayment(p: NewPayment): Promise<string> {
  const { data, error } = await supabase.rpc('crm_payment_register', {
    p_person_id: p.personId as string,
    p_kind: p.kind as string,
    p_master_id: p.masterId as string,
    p_amount: p.amount,
    p_currency: p.currency,
    p_paid_at: p.paidAt,
    p_provider: p.provider,
    p_provider_payment_id: p.providerPaymentId || undefined,
    p_subscription_id: p.subscriptionId,
    p_beca_pick_id: p.becaPickId,
  })
  if (error) throw error
  return data
}

export async function cancelSubscription(id: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('crm_subscription_cancel', { p_id: id, p_note: note || undefined })
  if (error) throw error
}

export async function refundPayment(id: string, amount: number, reason: RefundReason, note: string): Promise<void> {
  const { error } = await supabase.rpc('crm_payment_refund', {
    p_payment_id: id,
    p_amount: amount,
    p_reason: reason,
    p_note: note || undefined,
  })
  if (error) throw error
}

export async function fetchMasters(): Promise<{ id: string; name: string; price: number }[]> {
  const { data, error } = await supabase.from('masters').select('id, name, price').order('order_index')
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------------
export type CurrencyTotals = Database['public']['Functions']['crm_payments_report']['Returns'][number]

export async function fetchPaymentsReport(from: string, to: string): Promise<CurrencyTotals[]> {
  const { data, error } = await supabase.rpc('crm_payments_report', { p_from: from, p_to: to })
  if (error) throw error
  return data
}

type PaymentRow = Database['public']['Functions']['crm_payments_list']['Returns'][number]
export type PaymentListItem = Omit<PaymentRow, 'provider_payment_id' | 'fx_rate' | 'person_name' | 'guarantee_until'> & {
  provider_payment_id: string | null
  fx_rate: number | null
  person_name: string | null
  guarantee_until: string | null
}

export async function fetchPayments(from: string, to: string): Promise<PaymentListItem[]> {
  const { data, error } = await supabase.rpc('crm_payments_list', { p_from: from, p_to: to })
  if (error) throw error
  return data as PaymentListItem[]
}

// ---------------------------------------------------------------------------
// Inscripciones, cupo y cotización
// ---------------------------------------------------------------------------
export type Enrollment = {
  enrollments_open: boolean
  capacity: number
  opened_at: string | null
  active_plans: number
  site_url: string
  updated_at: string
  updated_by_email: string | null
}

export async function fetchEnrollment(): Promise<Enrollment> {
  const { data, error } = await supabase.rpc('crm_enrollment_view')
  if (error) throw error
  return data as unknown as Enrollment
}

export async function saveEnrollment(open: boolean, capacity: number): Promise<void> {
  const { error } = await supabase.rpc('crm_enrollment_save', { p_open: open, p_capacity: capacity })
  if (error) throw error
}

export type FxStatus = {
  rate: number | null
  source: 'dolarhoy.com' | 'manual' | null
  source_updated_text: string | null
  recorded_at: string | null
  recorded_by_email: string | null
  stale: boolean
  last_check_at: string | null
  last_check_result: 'ok' | 'sin_respuesta' | 'sin_dato' | 'fuera_de_rango' | 'salto_grande' | null
  last_check_detail: string | null
  history: { rate: number; source: string; at: string; by: string | null; note: string | null }[]
}

export async function fetchFx(): Promise<FxStatus> {
  const { data, error } = await supabase.rpc('crm_fx_status')
  if (error) throw error
  return data as unknown as FxStatus
}

export async function setFxManual(rate: number, note: string): Promise<void> {
  const { error } = await supabase.rpc('crm_fx_set_manual', { p_rate: rate, p_note: note || undefined })
  if (error) throw error
}

export const FX_CHECK_TEXT: Record<NonNullable<FxStatus['last_check_result']>, string> = {
  ok: 'La última lectura de dolarhoy.com salió bien.',
  sin_respuesta: 'dolarhoy.com no respondió en la última lectura.',
  sin_dato: 'No encontramos el dólar blue en dolarhoy.com: puede que hayan cambiado la página.',
  fuera_de_rango: 'La última lectura dio un valor imposible y no se guardó.',
  salto_grande: 'La última lectura saltó más de un 25% y no se guardó: confirmala a mano.',
}

// Acepta 1565, 1.565 o 1.565,50 (como se escribe en Argentina).
export function parseArsNumber(value: string): number | null {
  let clean = value.trim().replace(/^\$\s*/, '').replace(/\s/g, '')
  if (clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) clean = clean.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  const n = Number(clean)
  return n > 0 ? n : null
}

// ---------------------------------------------------------------------------
// Sorteo
// ---------------------------------------------------------------------------
export type PickStatus = 'por_avisar' | 'en_espera' | 'avisada' | 'acepto' | 'rechazo' | 'sin_respuesta'

export const PICK_STATUS_LABEL: Record<PickStatus, string> = {
  por_avisar: 'Por avisar',
  en_espera: 'Suplente en espera',
  avisada: 'Avisada',
  acepto: 'Aceptó',
  rechazo: 'No la quiere',
  sin_respuesta: 'No respondió',
}

export type RafflePick = {
  id: string
  position: number
  role: 'titular' | 'suplente'
  number: number
  status: PickStatus
  person_id: string | null
  name: string | null
  public_name: string | null
  notified_at: string | null
  respond_by: string | null
  beca_until: string | null
  resolved_at: string | null
  subscription_id: string | null
}

export type Raffle = {
  id: string
  status: 'preparado' | 'sorteado' | 'cerrado'
  scheduled_for: string | null
  winners: number
  substitutes: number
  discount_percent: number
  entries_count: number
  entries_digest: string | null
  created_at: string
  created_by_email: string | null
  drawn_at: string | null
  drawn_by_email: string | null
  closed_at: string | null
  draws: { attempt: number; number: number; repeated: boolean }[]
  picks: RafflePick[]
}

export type RaffleAnnouncement = {
  raffle_date: string
  created_at: string
  created_by_email: string | null
  recipients: number
  sent: number
}

export type RaffleView = {
  enrollments_open: boolean
  opened_at: string | null
  waitlist_count: number
  announcement: RaffleAnnouncement | null
  raffles: Raffle[]
}

export async function fetchRaffles(): Promise<RaffleView> {
  const { data, error } = await supabase.rpc('crm_raffle_view')
  if (error) throw error
  return data as unknown as RaffleView
}

// Manda la fecha del sorteo a toda la lista de espera. Devuelve cuántos emails quedaron en cola.
export async function announceRaffle(date: string): Promise<number> {
  const { data, error } = await supabase.rpc('crm_raffle_announce', { p_date: date })
  if (error) throw error
  return data
}

export async function prepareRaffle(scheduledFor: string): Promise<string> {
  const { data, error } = await supabase.rpc('crm_raffle_prepare', { p_scheduled_for: scheduledFor })
  if (error) throw error
  return data
}

export async function drawRaffle(id: string): Promise<void> {
  const { error } = await supabase.rpc('crm_raffle_draw', { p_id: id })
  if (error) throw error
}

export async function notifyPick(id: string): Promise<void> {
  const { error } = await supabase.rpc('crm_raffle_notify', { p_pick_id: id })
  if (error) throw error
}

export async function resolvePick(id: string, status: 'acepto' | 'rechazo' | 'sin_respuesta'): Promise<void> {
  const { error } = await supabase.rpc('crm_raffle_resolve', { p_pick_id: id, p_status: status })
  if (error) throw error
}

export async function closeRaffle(id: string): Promise<void> {
  const { error } = await supabase.rpc('crm_raffle_close', { p_id: id })
  if (error) throw error
}

// Número que se muestra en pantalla durante la grabación: solo números, sin datos personales.
export function drawnNumbers(raffle: Pick<Raffle, 'picks'>): { titulares: number[]; suplentes: number[] } {
  const ordered = [...raffle.picks].sort((a, b) => a.position - b.position)
  return {
    titulares: ordered.filter((p) => p.role === 'titular').map((p) => p.number),
    suplentes: ordered.filter((p) => p.role === 'suplente').map((p) => p.number),
  }
}

export const PAYMENT_STATUS_LABEL: Record<Payment['status'], string> = {
  aprobado: 'Cobrado',
  reembolsado: 'Devuelto',
  reembolso_parcial: 'Devolución parcial',
}

// CSV del listado de pagos. Los montos van sin separador de miles para que Excel los sume.
export function paymentsCsvRows(rows: PaymentListItem[]): { header: string[]; rows: unknown[][] } {
  const plain = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))
  return {
    header: [
      'Fecha', 'Código', 'Persona', 'Producto', 'Tipo', 'Medio', 'Operación', 'Moneda', 'Monto', 'Devuelto',
      'Dólar blue', 'Beca', 'Estado',
    ],
    rows: rows.map((p) => [
      toLocalInput(new Date(p.paid_at)).slice(0, 10),
      p.code,
      p.person_name ?? '',
      p.product,
      p.kind === 'alta' ? 'Alta' : 'Renovación',
      PROVIDER_LABEL[p.provider as Provider] ?? p.provider,
      p.provider_payment_id ?? '',
      p.currency,
      plain(p.amount),
      plain(p.refunded_amount),
      plain(p.fx_rate),
      p.beca ? 'Sí' : 'No',
      PAYMENT_STATUS_LABEL[p.status as Payment['status']] ?? p.status,
    ]),
  }
}

// Primer día del mes y hoy, en fecha de Buenos Aires (YYYY-MM-DD).
export function monthRange(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 7)}-01`, to: today }
}

export type PublicPrices = {
  plan: { usd: number; ars: number | null }
  masters: { id: string; nombre: string; usd: number; ars: number | null }[]
  cotizacion: number | null
  cotizacion_fecha: string | null
}

// Los mismos precios que ve el sitio: dólares de lista y pesos al dólar blue vigente.
export async function fetchPublicPrices(): Promise<PublicPrices> {
  const { data, error } = await supabase.rpc('crm_public_prices')
  if (error) throw error
  return data as unknown as PublicPrices
}

// Día de Buenos Aires de un instante (YYYY-MM-DD). Cortar el ISO daría el día en UTC.
export function localDay(iso: string): string {
  return toLocalInput(new Date(iso)).slice(0, 10)
}
