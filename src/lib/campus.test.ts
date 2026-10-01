import { campusInviteText, inviteToCampus } from './campus'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } }, clearStoredSession: vi.fn() }))

describe('invitación al Campus', () => {
  beforeEach(() => invoke.mockReset())

  it('llama a la función con la suscripción y el idioma', async () => {
    invoke.mockResolvedValue({ data: { estado: 'invitada' }, error: null })
    await expect(inviteToCampus('s1', 'pt')).resolves.toEqual({ estado: 'invitada' })
    expect(invoke).toHaveBeenCalledWith('campus-acceso', {
      body: { action: 'invitar', subscription_id: 's1', locale: 'pt' },
    })
  })

  it('muestra el motivo que devuelve la función cuando rechaza', async () => {
    const context = new Response(JSON.stringify({ error: 'sin_acceso', mensaje: 'Esta suscripción no da acceso al Campus.' }), {
      status: 409,
    })
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context } })
    await expect(inviteToCampus('s1', 'es')).rejects.toThrow('Esta suscripción no da acceso al Campus.')
  })

  it('sin respuesta legible, un mensaje general', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', context: undefined } })
    await expect(inviteToCampus('s1', 'es')).rejects.toThrow(/No hubo respuesta del Campus/)
  })

  it('explica qué pasó', () => {
    expect(campusInviteText({ estado: 'invitada' })).toMatch(/invitación al Campus/)
    expect(campusInviteText({ estado: 'ya_tiene_cuenta' })).toMatch(/contraseña de siempre/)
  })
})
