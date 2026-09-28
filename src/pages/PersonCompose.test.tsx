import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readyState, renderWithAuth } from '../test/renderWithAuth'
import { PersonPage } from './PersonPage'
import type { PersonDetail } from '../lib/crm'

const api = vi.hoisted(() => ({ fetchPerson: vi.fn(), composeEmail: vi.fn(), sendNow: vi.fn() }))

vi.mock('../lib/supabase', () => ({ supabase: {}, clearStoredSession: vi.fn() }))
vi.mock('../lib/crm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/crm')>()),
  fetchPerson: api.fetchPerson,
}))
vi.mock('../lib/emails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/emails')>()),
  composeEmail: api.composeEmail,
  sendNow: api.sendNow,
}))

const detail: PersonDetail = {
  person: {
    id: 'p1', first_name: 'Ana', last_name: 'Pérez', email: null, phone: null, contact_hidden: true, country: null,
    tags: [], created_at: '2026-09-28T12:00:00Z', last_activity_at: '2026-09-28T12:00:00Z',
  },
  messages: [],
  hidden_messages: 0,
  notes: [],
  consents: [],
  data_requests: null,
  emails: [
    {
      id: 'e1', kind: 'confirmacion', lead_source: 'baja', subject: 'Confirmación de tu baja', body: 'Hola Ana',
      status: 'pendiente', created_at: '2026-09-28T12:00:00Z', sent_at: null, created_by_email: null, last_error: null,
      cancel_reason: null,
    },
  ],
}

describe('email desde la ficha', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    api.fetchPerson.mockResolvedValue(detail)
  })

  it('muestra los emails en el historial', async () => {
    renderWithAuth(<PersonPage id="p1" />, readyState({}, ['personas.ver']))
    expect(await screen.findByText('Email: Confirmación de tu baja')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir en Emails' })).toHaveAttribute('href', '/emails?email=e1')
    expect(screen.queryByRole('button', { name: 'Escribir un email' })).not.toBeInTheDocument()
  })

  it('escribe y deja en cola cuando Resend no está activo', async () => {
    api.composeEmail.mockResolvedValue('nuevo')
    api.sendNow.mockResolvedValue({ configurado: false, mensaje: 'Falta la clave' })
    renderWithAuth(<PersonPage id="p1" />, readyState({}, ['personas.ver', 'mensajes.responder']))
    await userEvent.click(await screen.findByRole('button', { name: 'Escribir un email' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribí el asunto y el texto del email.')
    await userEvent.type(screen.getByLabelText('Asunto'), 'Tu consulta')
    await userEvent.type(screen.getByLabelText('Texto'), 'Hola Ana, te cuento.')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(api.composeEmail).toHaveBeenCalledWith('p1', 'Tu consulta', 'Hola Ana, te cuento.')
    expect(api.sendNow).toHaveBeenCalledWith(['nuevo'])
    expect(await screen.findByText(/Quedó en la cola/)).toBeInTheDocument()
  })
})
