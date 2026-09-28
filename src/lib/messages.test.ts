import {
  confirmationHref,
  confirmationText,
  emptyMessageText,
  fullName,
  mailHref,
  replyHref,
  requestState,
  requestStateText,
  visibleMessages,
  whatsappHref,
  type Message,
} from './messages'

function msg(partial: Partial<Message>): Message {
  return {
    id: '1', created_at: '2026-09-28T12:00:00Z', source: 'contacto', name: 'Ana', last_name: 'Pérez',
    email: 'ana@example.com', phone: null, contact_hidden: false, country: null, motivo: null, message: null,
    status: 'nuevo', notes: null, request_code: null, confirmed_at: null, privacy_consent: true,
    publish_consent: false, adult_confirmed: false, person_id: 'p1', can_handle: true, ...partial,
  }
}

describe('plazo de 24 horas de los pedidos', () => {
  const created = '2026-09-28T12:00:00Z'

  it('está pendiente antes de las 24 horas', () => {
    const s = requestState(created, null, new Date('2026-09-29T11:59:00Z'))
    expect(s.kind).toBe('pendiente')
    expect(requestStateText(s)).toBe('Confirmar por email antes del 29/09/2026 09:00')
  })

  it('vence a las 24 horas', () => {
    const s = requestState(created, null, new Date('2026-09-29T12:01:00Z'))
    expect(s.kind).toBe('vencido')
    expect(requestStateText(s)).toMatch(/^Sin confirmar · el plazo venció el/)
  })

  it('queda confirmado aunque haya vencido', () => {
    const s = requestState(created, '2026-09-30T15:00:00Z', new Date('2026-10-05T00:00:00Z'))
    expect(requestStateText(s)).toBe('Confirmado el 30/09/2026 12:00')
  })
})

describe('links de email', () => {
  it('solo arma mailto con emails seguros', () => {
    expect(mailHref('ana@example.com')).toBe('mailto:ana@example.com')
    expect(mailHref('ana@example.com?cc=otro@example.com')).toBeNull()
    expect(mailHref('ana@example.com,otro@example.com')).toBeNull()
    expect(mailHref('ana example@x.com')).toBeNull()
    expect(mailHref(null)).toBeNull()
  })

  it('arma la respuesta según el tipo', () => {
    expect(replyHref({ email: 'ana@example.com', source: 'suscripcion' })).toBe(
      'mailto:ana@example.com?subject=AVA%20%E2%80%94%20lista%20de%20espera',
    )
    expect(replyHref({ email: 'ana@example.com', source: 'contacto' })).toContain('Re%3A%20tu%20consulta%20a%20AVA')
  })

  it('redacta la confirmación igual que Núcleo', () => {
    const text = confirmationText({ source: 'baja', name: 'Ana', request_code: 'BAJ-ABC123' })
    expect(text?.subject).toBe('AVA — Confirmación de tu pedido de baja de servicio (BAJ-ABC123)')
    expect(text?.body).toContain('Tu suscripción no se va a renovar y mantenés el acceso hasta el final del año contratado.')
    expect(text?.body.startsWith('Hola Ana:\n\n')).toBe(true)
    const arr = confirmationText({ source: 'arrepentimiento', name: 'Ana', request_code: 'ARR-XYZ789' })
    expect(arr?.body).toContain('Vamos a gestionar la devolución')
    expect(confirmationText({ source: 'contacto', name: 'Ana', request_code: null })).toBeNull()
    expect(confirmationHref({ source: 'baja', name: 'Ana', request_code: 'BAJ-1', email: 'mal email' })).toBeNull()
  })
})

describe('otros textos', () => {
  it('arma WhatsApp solo con 8 dígitos o más', () => {
    expect(whatsappHref('+54 9 11 5555-0000')).toBe('https://wa.me/5491155550000')
    expect(whatsappHref('1234')).toBeNull()
  })

  it('nombra a la persona', () => {
    expect(fullName('Ana', null)).toBe('Ana')
    expect(fullName(null, null)).toBe('Sin nombre')
  })

  it('describe los mensajes vacíos', () => {
    expect(emptyMessageText('baja')).toBe('Pedido de baja de servicio (sin comentario).')
    expect(emptyMessageText('suscripcion')).toMatch(/lista de espera/)
    expect(emptyMessageText('contacto')).toBe('Sin mensaje.')
  })

  it('filtra por tipo y archivados', () => {
    const list = [msg({ id: 'a' }), msg({ id: 'b', status: 'archivado' }), msg({ id: 'c', source: 'baja' })]
    expect(visibleMessages(list, 'todos', false).map((m) => m.id)).toEqual(['a', 'c'])
    expect(visibleMessages(list, 'contacto', true).map((m) => m.id)).toEqual(['a', 'b'])
  })
})
