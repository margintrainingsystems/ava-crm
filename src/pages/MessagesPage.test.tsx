import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { MessagesPage } from './MessagesPage'
import type { Message } from '../lib/messages'

const crm = vi.hoisted(() => ({
  fetchMessages: vi.fn(),
  setMessageStatus: vi.fn(),
  saveMessageNotes: vi.fn(),
  confirmRequest: vi.fn(),
  deleteMessage: vi.fn(),
  logExport: vi.fn(),
  notifyMessagesChanged: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/crm', () => crm)

function msg(partial: Partial<Message>): Message {
  return {
    id: 'c1', created_at: '2026-09-28T12:00:00Z', source: 'contacto', name: 'Ana', last_name: 'Pérez',
    email: 'ana@example.com', phone: '+54 9 11 5555 0000', contact_hidden: false, country: 'Argentina',
    motivo: 'Propuesta académica', message: '¿Cuándo abren?', status: 'nuevo', notes: null, request_code: null,
    confirmed_at: null, privacy_consent: true, publish_consent: false, adult_confirmed: false, person_id: 'p1',
    can_handle: true, ...partial,
  }
}

const request = msg({
  id: 'r1', source: 'baja', request_code: 'BAJ-ABC123', motivo: '123456', message: null, status: 'leido', privacy_consent: false,
})

describe('MessagesPage', () => {
  beforeEach(() => {
    Object.values(crm).forEach((f) => f.mockReset())
    crm.setMessageStatus.mockResolvedValue(undefined)
  })

  it('muestra solo las pestañas que permite el rol', async () => {
    crm.fetchMessages.mockResolvedValue([msg({})])
    renderWithAuth(<MessagesPage />, readyState({}, ['mensajes.ver', 'mensajes.responder']))
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    const tabs = screen.getByRole('group', { name: 'Tipo de mensaje' })
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Todos (1)',
      'Contacto (1)',
      'Lista de espera (0)',
    ])
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument()
  })

  it('al abrir un mensaje lo marca como leído y ofrece responder', async () => {
    crm.fetchMessages.mockResolvedValue([msg({})])
    renderWithAuth(<MessagesPage />, readyState({}, ['mensajes.ver', 'mensajes.responder', 'personas.ver']))
    await userEvent.click(await screen.findByRole('button', { name: /Ana Pérez/ }))
    expect(crm.setMessageStatus).toHaveBeenCalledWith('c1', 'leido')
    expect(screen.getByText('¿Cuándo abren?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Responder por email' })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:ana@example.com?subject='),
    )
    expect(screen.getByRole('link', { name: 'Escribir por WhatsApp' })).toHaveAttribute('href', 'https://wa.me/5491155550000')
    expect(screen.getByRole('link', { name: 'Ver la ficha de la persona' })).toHaveAttribute('href', '/personas/p1')
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
  })

  it('oculta email y teléfono sin el permiso de contacto', async () => {
    crm.fetchMessages.mockResolvedValue([msg({ email: null, phone: null, contact_hidden: true })])
    renderWithAuth(<MessagesPage />, readyState({}, ['mensajes.ver', 'mensajes.responder']))
    expect(await screen.findByText(/Contacto oculto/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Ana Pérez/ }))
    expect(screen.getByText('Oculto: tu rol no incluye ver email y teléfono.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Responder por email' })).not.toBeInTheDocument()
  })

  it('confirma un pedido con el email redactado y el botón de la norma', async () => {
    crm.fetchMessages.mockResolvedValue([request])
    crm.confirmRequest.mockResolvedValue('2026-09-28T13:00:00Z')
    renderWithAuth(<MessagesPage />, readyState({}, [], true))
    expect(await screen.findByText(/Confirmar por email antes del|Sin confirmar/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Ana Pérez/ }))
    expect(screen.getByRole('link', { name: 'Enviar confirmación por email' })).toHaveAttribute(
      'href',
      expect.stringContaining('BAJ-ABC123'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como confirmado' }))
    expect(crm.confirmRequest).toHaveBeenCalledWith('r1')
    expect(await screen.findByText('Pedido marcado como confirmado.')).toBeInTheDocument()
    expect(screen.getAllByText('Confirmado el 28/09/2026 10:00').length).toBeGreaterThan(0)
  })

  it('guarda notas y elimina con confirmación', async () => {
    crm.fetchMessages.mockResolvedValue([msg({ status: 'leido' })])
    crm.saveMessageNotes.mockResolvedValue(undefined)
    crm.deleteMessage.mockResolvedValue(undefined)
    renderWithAuth(<MessagesPage />, readyState({}, [], true))
    await userEvent.click(await screen.findByRole('button', { name: /Ana Pérez/ }))
    await userEvent.type(screen.getByLabelText('Notas internas'), '  Le escribí  ')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
    expect(crm.saveMessageNotes).toHaveBeenCalledWith('c1', 'Le escribí')

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    expect(crm.deleteMessage).toHaveBeenCalledWith('c1')
    expect(await screen.findByText('Mensaje eliminado.')).toBeInTheDocument()
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
  })

  it('esconde los archivados salvo que se pidan', async () => {
    crm.fetchMessages.mockResolvedValue([msg({ status: 'archivado' })])
    renderWithAuth(<MessagesPage />, readyState({}, ['mensajes.ver']))
    expect(await screen.findByText('No hay mensajes para mostrar.')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Mostrar archivados'))
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
  })
})
