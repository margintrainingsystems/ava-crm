import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { ConfigPage } from './ConfigPage'
import type { EmailSettings, EmailTemplate } from '../lib/emails'
import type { Enrollment, FxStatus } from '../lib/billing'

const api = vi.hoisted(() => ({
  fetchEmailSettings: vi.fn(),
  fetchTemplates: vi.fn(),
  saveEmailSettings: vi.fn(),
  saveTemplate: vi.fn(),
  checkEmailService: vi.fn(),
  sendTestEmail: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/emails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/emails')>()),
  ...api,
}))
const billing = vi.hoisted(() => ({
  fetchEnrollment: vi.fn(),
  saveEnrollment: vi.fn(),
  fetchFx: vi.fn(),
  setFxManual: vi.fn(),
  fetchPublicPrices: vi.fn(),
}))
vi.mock('../lib/billing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/billing')>()),
  ...billing,
}))

const enrollment: Enrollment = {
  enrollments_open: false, capacity: 60, opened_at: null, active_plans: 0, site_url: 'https://aprendeconava.com',
  updated_at: '2026-09-28T12:00:00Z', updated_by_email: null,
}

const fx: FxStatus = {
  rate: 1565, source: 'dolarhoy.com', source_updated_text: '28/09/26 03:38 PM', recorded_at: '2026-09-28T18:41:37Z',
  recorded_by_email: null, stale: false, last_check_at: '2026-09-28T18:41:37Z', last_check_result: 'ok',
  last_check_detail: '1565', history: [],
}

const settings: EmailSettings = {
  id: 1, from_name: 'AVA', from_address: null, reply_to: null, auto_confirm: true, provider_ready: false,
  provider_checked_at: null, updated_at: '2026-09-28T12:00:00Z', updated_by_email: null,
}

const template: EmailTemplate = {
  key: 'confirmacion_baja', name: 'Confirmación de baja', description: 'Sale sola.', placeholders: ['nombre', 'codigo'],
  subject: 'Tu baja ({codigo})', body: 'Hola {nombre}.', updated_at: '2026-09-28T12:00:00Z', updated_by_email: null,
}

describe('ConfigPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    Object.values(billing).forEach((f) => f.mockReset())
    billing.fetchEnrollment.mockResolvedValue(enrollment)
    billing.fetchFx.mockResolvedValue(fx)
    billing.fetchPublicPrices.mockResolvedValue({ plan: { usd: 400, ars: 626000 }, masters: [], cotizacion: 1565, cotizacion_fecha: null })
    api.fetchEmailSettings.mockResolvedValue(settings)
    api.fetchTemplates.mockResolvedValue([template])
  })

  it('explica cómo activar los envíos y muestra la vista previa', async () => {
    renderWithAuth(<ConfigPage />, readyState({}, ['configuracion.editar']))
    expect(await screen.findByRole('heading', { name: 'Los envíos todavía no están activos' })).toBeInTheDocument()
    expect(screen.getByText(/RESEND_API_KEY/)).toBeInTheDocument()
    expect(await screen.findByText('Tu baja (ARR-7KQ2MX)')).toBeInTheDocument()
    expect(screen.getByText('Hola Lucía.')).toBeInTheDocument()
  })

  it('no guarda una plantilla con marcadores que no existen', async () => {
    renderWithAuth(<ConfigPage />, readyState({}, ['configuracion.editar']))
    const form = (await screen.findByRole('heading', { name: 'Confirmación de baja' })).closest('form') as HTMLFormElement
    const body = within(form).getByLabelText('Texto')
    await userEvent.clear(body)
    await userEvent.type(body, 'Hola {{nombre} {{apellido}')
    await userEvent.click(within(form).getByRole('button', { name: 'Guardar plantilla' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Estos marcadores no existen: {apellido}.')
    expect(api.saveTemplate).not.toHaveBeenCalled()
  })

  it('guarda la plantilla editada', async () => {
    api.saveTemplate.mockResolvedValue(undefined)
    renderWithAuth(<ConfigPage />, readyState({}, ['configuracion.editar']))
    const form = (await screen.findByRole('heading', { name: 'Confirmación de baja' })).closest('form') as HTMLFormElement
    const subject = within(form).getByLabelText('Asunto')
    await userEvent.clear(subject)
    await userEvent.type(subject, 'Listo tu baja')
    await userEvent.click(within(form).getByRole('button', { name: 'Guardar plantilla' }))
    expect(api.saveTemplate).toHaveBeenCalledWith('confirmacion_baja', 'Listo tu baja', 'Hola {nombre}.')
  })

  it('valida y guarda el remitente', async () => {
    api.saveEmailSettings.mockResolvedValue(undefined)
    renderWithAuth(<ConfigPage />, readyState({}, ['configuracion.editar']))
    const email = await screen.findByLabelText('Email remitente')
    await userEvent.type(email, 'no es email')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar remitente' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Revisá el email remitente.')
    await userEvent.clear(email)
    await userEvent.type(email, 'hola@aprendeconava.com')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar remitente' }))
    expect(api.saveEmailSettings).toHaveBeenCalledWith({
      fromName: 'AVA',
      fromAddress: 'hola@aprendeconava.com',
      replyTo: '',
      autoConfirm: true,
    })
  })

  it('la prueba muestra por qué no sale', async () => {
    api.sendTestEmail.mockResolvedValue({ configurado: false, mensaje: 'Falta cargar la clave de Resend.' })
    renderWithAuth(<ConfigPage />, readyState({}, ['configuracion.editar']))
    await userEvent.type(await screen.findByLabelText('Mandar un email de prueba a'), 'yo@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Mandar prueba' }))
    expect(api.sendTestEmail).toHaveBeenCalledWith('yo@example.com')
    expect(await screen.findByText('Falta cargar la clave de Resend.')).toBeInTheDocument()
  })

  it('abre las inscripciones con confirmación y avisa del corte del sorteo', async () => {
    billing.saveEnrollment.mockResolvedValue(undefined)
    renderWithAuth(<ConfigPage />, readyState({}, ['configuracion.editar']))
    expect(await screen.findByText('Las inscripciones están cerradas.')).toBeInTheDocument()
    expect(screen.getByText(/0 de 60 lugares ocupados/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir inscripciones' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Es la primera apertura/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir' }))
    expect(billing.saveEnrollment).toHaveBeenCalledWith(true, 60)
  })

  it('no guarda un cupo inválido', async () => {
    renderWithAuth(<ConfigPage />, readyState({}, ['configuracion.editar']))
    const input = await screen.findByLabelText('Cupo de suscripciones anuales')
    await userEvent.clear(input)
    await userEvent.type(input, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el cupo' }))
    expect(screen.getByText('El cupo tiene que ser un número entero, de 1 en adelante.')).toBeInTheDocument()
    expect(billing.saveEnrollment).not.toHaveBeenCalled()
  })

  it('muestra la cotización y carga una a mano con formato argentino', async () => {
    billing.setFxManual.mockResolvedValue(undefined)
    renderWithAuth(<ConfigPage />, readyState({}, ['configuracion.editar']))
    expect(await screen.findByText('$ 1.565')).toBeInTheDocument()
    expect(await screen.findByText('$ 626.000')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Cargar a mano (pesos por dólar)'), '1.580,50')
    await userEvent.click(screen.getByRole('button', { name: 'Cargar' }))
    expect(billing.setFxManual).toHaveBeenCalledWith(1580.5, '')
  })
})
