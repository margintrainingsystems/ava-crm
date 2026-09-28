import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { EmailsPage, emailTab, recipientText } from './EmailsPage'
import type { Email, EmailSettings } from '../lib/emails'

const api = vi.hoisted(() => ({
  fetchEmails: vi.fn(),
  fetchEmailSettings: vi.fn(),
  sendNow: vi.fn(),
  cancelEmail: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/emails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/emails')>()),
  ...api,
}))

const settings = (ready: boolean): EmailSettings => ({
  id: 1, from_name: 'AVA', from_address: ready ? 'hola@example.com' : null, reply_to: null, auto_confirm: true,
  provider_ready: ready, provider_checked_at: null, updated_at: '2026-09-28T12:00:00Z', updated_by_email: null,
})

function email(partial: Partial<Email>): Email {
  return {
    id: 'e1', kind: 'confirmacion', template_key: 'confirmacion_baja', person_id: 'p1', person_name: 'Ana Pérez',
    lead_id: 'l1', lead_source: 'baja', to_email: 'ana@example.com', contact_hidden: false,
    subject: 'Confirmación de tu baja', body: 'Hola Ana', status: 'pendiente', attempts: 0, last_error: null,
    cancel_reason: null, created_by_email: null, created_at: '2026-09-28T12:00:00Z', sent_at: null, can_handle: true,
    ...partial,
  }
}

describe('EmailsPage', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

  it('avisa que los envíos no están activos y lleva a Configuración a quien puede', async () => {
    api.fetchEmails.mockResolvedValue([email({})])
    api.fetchEmailSettings.mockResolvedValue(settings(false))
    renderWithAuth(<EmailsPage />, readyState({}, ['pedidos.gestionar', 'configuracion.editar']))
    expect(await screen.findByText('Los envíos todavía no están activos.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver cómo activarlos' })).toHaveAttribute('href', '/configuracion')
  })

  it('separa por estado y manda uno ahora', async () => {
    api.fetchEmails.mockResolvedValue([
      email({}),
      email({ id: 'e2', status: 'enviado', subject: 'Otro', sent_at: '2026-09-28T13:00:00Z' }),
      email({ id: 'e3', status: 'fallido', subject: 'Con problema', last_error: 'Resend respondió 422: dominio' }),
    ])
    api.fetchEmailSettings.mockResolvedValue(settings(true))
    api.sendNow.mockResolvedValue({ configurado: true, enviados: 1, fallidos: 0 })
    renderWithAuth(<EmailsPage />, readyState({}, ['pedidos.gestionar']))
    const tabs = await screen.findByRole('group', { name: 'Estado del email' })
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'En cola (1)',
      'Enviados (1)',
      'Con error (1)',
      'Cancelados (0)',
    ])
    expect(screen.queryByText('Los envíos todavía no están activos.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Confirmación de tu baja/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar ahora' }))
    expect(api.sendNow).toHaveBeenCalledWith(['e1'])
    expect(await screen.findByText('Email enviado.')).toBeInTheDocument()
  })

  it('cancela con confirmación y recuerda confirmar el pedido a mano', async () => {
    api.fetchEmails.mockResolvedValue([email({})])
    api.fetchEmailSettings.mockResolvedValue(settings(false))
    api.cancelEmail.mockResolvedValue(undefined)
    renderWithAuth(<EmailsPage />, readyState({}, ['pedidos.gestionar']), '/emails?email=e1')
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar el envío' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/confirmar el pedido a mano/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar el envío' }))
    expect(api.cancelEmail).toHaveBeenCalledWith('e1')
  })

  it('sin permiso para gestionar, no ofrece acciones', async () => {
    api.fetchEmails.mockResolvedValue([email({ can_handle: false, kind: 'manual', lead_source: null })])
    api.fetchEmailSettings.mockResolvedValue(settings(true))
    renderWithAuth(<EmailsPage />, readyState({}, ['mensajes.ver']), '/emails?email=e1')
    expect(await screen.findByText('Hola Ana')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar ahora' })).not.toBeInTheDocument()
  })

  it('agrupa estados y arma el destinatario sin mostrar el email oculto', () => {
    expect(emailTab({ status: 'enviando' })).toBe('cola')
    expect(emailTab({ status: 'fallido' })).toBe('error')
    expect(recipientText({ person_name: 'Ana', to_email: null, contact_hidden: true })).toBe('Ana')
    expect(recipientText({ person_name: null, to_email: 'x@example.com', contact_hidden: false })).toBe('x@example.com')
    expect(recipientText({ person_name: 'Ana', to_email: 'a@example.com', contact_hidden: false })).toBe(
      'Ana · a@example.com',
    )
  })
})
