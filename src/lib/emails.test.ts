import { PLACEHOLDER_HELP, renderTemplate, sampleValues, sendNow, sendResultText, unknownPlaceholders } from './emails'
import { confirmationText } from './messages'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } }, clearStoredSession: vi.fn() }))

describe('plantillas', () => {
  it('reemplaza los marcadores y deja vacíos los desconocidos, igual que la base', () => {
    expect(renderTemplate('Hola {nombre}, tu código es {codigo}.{otro}', { nombre: 'Ana', codigo: 'BAJ-1' })).toBe(
      'Hola Ana, tu código es BAJ-1.',
    )
  })

  it('detecta marcadores que la plantilla no admite', () => {
    expect(unknownPlaceholders('Hola {nombre} {apellido} {apellido}', ['nombre', 'codigo'])).toEqual(['apellido'])
    expect(unknownPlaceholders('Sin marcadores', ['nombre'])).toEqual([])
  })

  it('el email de confirmación redactado usa la plantilla guardada', () => {
    const text = confirmationText({ source: 'baja', name: ' Ana ', request_code: 'BAJ-ABC123' }, [
      { key: 'confirmacion_baja', subject: 'Baja {codigo}', body: 'Hola {nombre}. {codigo}' },
    ])
    expect(text).toEqual({ subject: 'Baja BAJ-ABC123', body: 'Hola Ana. BAJ-ABC123' })
    // Sin plantilla cargada, el texto de siempre.
    expect(confirmationText({ source: 'baja', name: 'Ana', request_code: 'BAJ-1' })?.subject).toContain('BAJ-1')
  })
})

describe('envíos', () => {
  beforeEach(() => invoke.mockReset())

  it('explica qué pasó después de enviar', () => {
    expect(sendResultText({ configurado: false })).toMatch(/Quedó en la cola/)
    expect(sendResultText({ configurado: false }, 2)).toMatch(/Quedaron en la cola/)
    expect(sendResultText({ configurado: true, enviados: 1, fallidos: 0 })).toBe('Email enviado.')
    expect(sendResultText({ configurado: true, enviados: 3, fallidos: 0 })).toBe('Se enviaron 3 emails.')
    expect(sendResultText({ configurado: true, enviados: 0, fallidos: 1 })).toMatch(/No se pudo enviar/)
    expect(sendResultText({ configurado: true, enviados: 0, fallidos: 0 })).toMatch(/Ya se estaba enviando/)
  })

  it('llama a la función con los ids', async () => {
    invoke.mockResolvedValue({ data: { configurado: true, enviados: 1, fallidos: 0 }, error: null })
    await expect(sendNow(['a'])).resolves.toEqual({ configurado: true, enviados: 1, fallidos: 0 })
    expect(invoke).toHaveBeenCalledWith('crm-emails', { body: { action: 'enviar', ids: ['a'] } })
  })

  it('muestra el motivo que devuelve la función cuando rechaza', async () => {
    const context = new Response(JSON.stringify({ error: 'rechazado', mensaje: 'No tenés permiso para hacer esto' }), {
      status: 403,
    })
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context } })
    await expect(sendNow(['a'])).rejects.toThrow('No tenés permiso para hacer esto')
  })

  it('sin respuesta legible, un mensaje general', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', context: undefined } })
    await expect(sendNow(['a'])).rejects.toThrow(/No hubo respuesta del servicio de emails/)
  })
})

describe('sampleValues', () => {
  it('tiene un ejemplo para cada marcador y la fecha larga en el aviso del sorteo', () => {
    expect(Object.keys(sampleValues('confirmacion_baja')).sort()).toEqual(Object.keys(PLACEHOLDER_HELP).sort())
    expect(sampleValues('aviso_fecha_sorteo').fecha).toBe('lunes 12 de octubre de 2026')
    expect(sampleValues('aviso_renovacion').fecha).toBe('22/09/2027')
  })
})
