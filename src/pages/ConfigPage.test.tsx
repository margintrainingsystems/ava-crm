import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { ConfigPage } from './ConfigPage'
import type { EmailSettings, EmailTemplate } from '../lib/emails'

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
})
