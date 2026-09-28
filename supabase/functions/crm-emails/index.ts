// Edge Function crm-emails: manda con Resend los emails que esperan en la cola del CRM.
//
// Acciones:
//   procesar  La llama el cron de la base cada minuto (con el token del Vault). Manda lo pendiente.
//   estado    Dice si Resend está listo: clave cargada y remitente elegido en el CRM.
//   enviar    "Enviar ahora" desde el CRM, para uno o varios emails. Revisa el permiso de quien llama.
//   probar    Manda un email de prueba a una dirección del equipo.
//
// La clave de Resend vive solo acá, como secreto RESEND_API_KEY de la función. Mientras falte,
// los emails se quedan en la cola y el CRM avisa que los envíos no están activos.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_URL = 'https://api.resend.com/emails'
const ALLOWED_ORIGINS = (
  Deno.env.get('CRM_ALLOWED_ORIGINS') ??
    'https://ava-nucleo.netlify.app,https://ava-crm.netlify.app,http://localhost:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Resend acepta 2 pedidos por segundo en su plan inicial: mandamos de a uno, con pausa.
const PAUSE_MS = 600

type Json = Record<string, unknown>
type Settings = { from_name: string; from_address: string | null; reply_to: string | null }
type Queued = { id: string; kind: string; lead_id: string | null; to_email: string; subject: string; body: string }

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '')
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  }
}

function reply(origin: string | null, status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function fail(origin: string | null, status: number, error: string, mensaje: string): Response {
  return reply(origin, status, { error, mensaje })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// "AVA" <hola@dominio>: sin comillas ni signos que rompan el encabezado.
function fromHeader(s: Settings): string {
  const name = s.from_name.replace(/["<>\r\n]/g, '').trim() || 'AVA'
  return `${name} <${s.from_address}>`
}

// Lee el remitente, decide si se puede mandar y lo deja anotado para el CRM y el cron.
async function readiness(
  admin: SupabaseClient,
): Promise<{ ready: boolean; settings: Settings | null; reason: string }> {
  const { data, error } = await admin.from('crm_email_settings').select('from_name, from_address, reply_to').eq('id', 1)
    .single()
  if (error || !data) return { ready: false, settings: null, reason: 'No pudimos leer la configuración de emails.' }
  const settings = data as Settings
  let reason = ''
  if (!RESEND_API_KEY) reason = 'Falta cargar la clave de Resend (RESEND_API_KEY) en la función crm-emails.'
  else if (!settings.from_address) reason = 'Falta elegir el email remitente en CRM → Configuración.'
  const ready = reason === ''
  const { error: statusError } = await admin.rpc('crm_email_provider_status', { p_ready: ready })
  if (statusError) console.error('No se pudo guardar el estado de Resend', statusError.message)
  return { ready, settings, reason }
}

async function sendOne(email: Queued, settings: Settings): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // Si el mismo email se intenta dos veces, Resend no lo duplica.
        'Idempotency-Key': `crm-${email.id}`,
      },
      body: JSON.stringify({
        from: fromHeader(settings),
        to: [email.to_email],
        subject: email.subject,
        text: email.body,
        ...(settings.reply_to ? { reply_to: settings.reply_to } : {}),
      }),
    })
    const payload = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
    if (res.ok && payload.id) return { ok: true, id: payload.id }
    return { ok: false, error: `Resend respondió ${res.status}: ${payload.message ?? payload.name ?? 'sin detalle'}` }
  } catch (e) {
    return { ok: false, error: `No hubo conexión con Resend: ${e instanceof Error ? e.message : String(e)}` }
  }
}

async function sendClaimed(admin: SupabaseClient, settings: Settings, ids: string[] | null) {
  const { data, error } = await admin.rpc('crm_email_claim', { p_ids: ids, p_limit: ids ? ids.length : 20 })
  if (error) throw new Error(`No se pudo leer la cola: ${error.message}`)
  const queued = (data ?? []) as Queued[]
  let enviados = 0
  let fallidos = 0
  for (const [i, email] of queued.entries()) {
    if (i > 0) await sleep(PAUSE_MS)
    const result = await sendOne(email, settings)
    const { error: markError } = await admin.rpc('crm_email_mark', {
      p_id: email.id,
      p_ok: result.ok,
      p_provider_id: result.id ?? null,
      p_error: result.error ?? null,
    })
    if (markError) console.error('No se pudo guardar el resultado del envío', email.id, markError.message)
    if (result.ok) enviados++
    else fallidos++
  }
  return { enviados, fallidos }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return fail(origin, 405, 'metodo', 'Método no permitido.')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return fail(origin, 500, 'configuracion', 'Falta configurar la función.')

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let body: Json
  try {
    body = (await req.json()) as Json
  } catch {
    return fail(origin, 400, 'formato', 'La solicitud no tiene el formato esperado.')
  }

  // 1. El cron de la base.
  if (body.action === 'procesar') {
    const token = req.headers.get('x-crm-cron') ?? ''
    const { data: ok, error } = await admin.rpc('crm_cron_token_ok', { p_token: token })
    if (error || ok !== true) return fail(origin, 401, 'sin_permiso', 'Token inválido.')
    const state = await readiness(admin)
    if (!state.ready || !state.settings) return reply(origin, 200, { configurado: false, mensaje: state.reason })
    try {
      return reply(origin, 200, { configurado: true, ...(await sendClaimed(admin, state.settings, null)) })
    } catch (e) {
      return fail(origin, 500, 'base', e instanceof Error ? e.message : 'Error al procesar la cola.')
    }
  }

  // 2. Pedidos del CRM: con la sesión de quien llama.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const apikey = ANON_KEY || req.headers.get('apikey') || ''
  if (!token || !apikey) return fail(origin, 401, 'sin_sesion', 'Tu sesión venció. Volvé a entrar.')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return fail(origin, 401, 'sin_sesion', 'Tu sesión venció. Volvé a entrar.')
  // Las funciones de la base revisan los permisos con esta sesión (auth.uid()).
  const asUser = createClient(SUPABASE_URL, apikey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: member } = await admin.from('crm_members').select('active').eq('user_id', userData.user.id)
    .maybeSingle()
  if (!member?.active) return fail(origin, 403, 'sin_permiso', 'Tu cuenta no tiene acceso al CRM.')

  if (body.action === 'estado') {
    const state = await readiness(admin)
    return reply(origin, 200, { configurado: state.ready, mensaje: state.reason })
  }

  if (body.action !== 'enviar' && body.action !== 'probar') return fail(origin, 400, 'accion', 'Acción desconocida.')
  // Sin Resend listo no se crea ni se reintenta nada: los emails siguen en la cola.
  const state = await readiness(admin)
  if (!state.ready || !state.settings) {
    return reply(origin, 200, { configurado: false, mensaje: state.reason, enviados: 0, fallidos: 0 })
  }

  let ids: string[] = []
  if (body.action === 'enviar') {
    ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))
      : []
    if (ids.length === 0 || ids.length > 20) return fail(origin, 400, 'formato', 'Elegí entre 1 y 20 emails.')
  } else if (body.action === 'probar') {
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    const { data, error } = await asUser.rpc('crm_email_test', { p_to: to })
    if (error) {
      return fail(
        origin,
        error.code === '42501' ? 403 : 400,
        'rechazado',
        error.message || 'No se pudo crear la prueba.',
      )
    }
    ids = [data as string]
  }

  for (const id of ids) {
    const { error } = await asUser.rpc('crm_email_request_send', { p_id: id })
    if (error) {
      return fail(origin, error.code === '42501' ? 403 : 400, 'rechazado', error.message || 'No se pudo enviar.')
    }
  }
  try {
    return reply(origin, 200, { configurado: true, ...(await sendClaimed(admin, state.settings, ids)) })
  } catch (e) {
    return fail(origin, 500, 'base', e instanceof Error ? e.message : 'Error al enviar.')
  }
})
