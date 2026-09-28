// Edge Function crm-equipo: invita personas al equipo del CRM, reenvía invitaciones
// y devuelve el estado de cada cuenta. Solo la propietaria del CRM la puede usar.
//
// Usa la service_role, que nunca sale de Supabase. Verifica a quien llama con su token
// de sesión, porque la opción verify_jwt de Supabase queda apagada (ver README).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ALLOWED_ORIGINS = (Deno.env.get('CRM_ALLOWED_ORIGINS') ?? 'https://ava-crm.netlify.app,http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Json = Record<string, unknown>

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

function isValidEmail(value: string): boolean {
  return value.length >= 3 && value.length <= 320 && !value.includes('..') && EMAIL_RE.test(value)
}

async function audit(
  admin: SupabaseClient,
  actor: { id: string; email: string },
  action: string,
  entityId: string,
  detail: Json,
): Promise<void> {
  const { error } = await admin.from('crm_audit_log').insert({
    actor_id: actor.id,
    actor_email: actor.email,
    action,
    entity: 'crm_members',
    entity_id: entityId,
    detail,
  })
  if (error) console.error('No se pudo registrar en la auditoría', error.message)
}

function redirectTo(origin: string | null): string {
  const base = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '')
  return `${base}/definir-contrasena`
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return fail(origin, 405, 'metodo', 'Método no permitido.')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return fail(origin, 500, 'configuracion', 'Falta configurar la función.')

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Quién llama: tiene que ser la propietaria activa del CRM.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return fail(origin, 401, 'sin_sesion', 'Tu sesión venció. Volvé a entrar.')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return fail(origin, 401, 'sin_sesion', 'Tu sesión venció. Volvé a entrar.')

  const { data: caller, error: callerError } = await admin
    .from('crm_members')
    .select('user_id, email, is_owner, active')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (callerError) return fail(origin, 500, 'base', 'No pudimos verificar tu cuenta. Probá de nuevo.')
  if (!caller?.is_owner || !caller.active) {
    return fail(origin, 403, 'sin_permiso', 'Solo la propietaria del CRM puede gestionar el equipo.')
  }
  const actor = { id: caller.user_id as string, email: caller.email as string }

  let body: Json
  try {
    body = (await req.json()) as Json
  } catch {
    return fail(origin, 400, 'formato', 'La solicitud no tiene el formato esperado.')
  }

  // 2. Acciones
  if (body.action === 'estado') {
    const { data: members, error } = await admin.from('crm_members').select('user_id')
    if (error) return fail(origin, 500, 'base', 'No pudimos leer el equipo.')
    const ids = members.map((m) => m.user_id as string)
    const { data: users, error: statusError } = await admin.rpc('crm_admin_users_status', { p_ids: ids })
    if (statusError) return fail(origin, 500, 'base', 'No pudimos leer el estado de las cuentas.')
    const miembros = (users as {
      id: string
      invited_at: string | null
      email_confirmed_at: string | null
      last_sign_in_at: string | null
    }[]).map(
      (u) => ({
        user_id: u.id,
        invitada_el: u.invited_at,
        confirmada: u.email_confirmed_at !== null,
        ultimo_ingreso: u.last_sign_in_at,
      }),
    )
    return reply(origin, 200, { miembros })
  }

  if (body.action === 'invitar') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const displayName = String(body.display_name ?? '').trim()
    const roleId = String(body.role_id ?? '')

    if (!isValidEmail(email)) return fail(origin, 400, 'email', 'Revisá el email: tiene que ser una dirección válida.')
    if (!displayName || displayName.length > 120) {
      return fail(origin, 400, 'nombre', 'Escribí el nombre de la persona (hasta 120 caracteres).')
    }
    if (!UUID_RE.test(roleId)) return fail(origin, 400, 'rol', 'Elegí un rol.')

    const { data: role } = await admin.from('crm_roles').select('id').eq('id', roleId).maybeSingle()
    if (!role) return fail(origin, 400, 'rol', 'El rol elegido ya no existe. Recargá la página.')

    const { data: found, error: findError } = await admin.rpc('crm_admin_find_user', { p_email: email })
    if (findError) return fail(origin, 500, 'base', 'No pudimos buscar la cuenta. Probá de nuevo.')
    const existing =
      (found as { id: string; email_confirmed_at: string | null; last_sign_in_at: string | null }[] | null)
        ?.[0]

    if (existing) {
      const { data: already } = await admin
        .from('crm_members')
        .select('user_id, active')
        .eq('user_id', existing.id)
        .maybeSingle()
      if (already) {
        return fail(
          origin,
          409,
          'ya_es_miembro',
          already.active
            ? 'Esa persona ya es parte del equipo.'
            : 'Esa persona ya es parte del equipo, con el acceso desactivado. Reactivala desde la lista.',
        )
      }
      const { error: insertError } = await admin.from('crm_members').insert({
        user_id: existing.id,
        email,
        display_name: displayName,
        role_id: roleId,
        invited_by: actor.id,
      })
      if (insertError) return fail(origin, 500, 'base', 'No pudimos sumar a la persona. Probá de nuevo.')

      // La cuenta existe pero nunca se activó (por ejemplo, una invitación vieja): le mandamos el link de nuevo.
      if (!existing.email_confirmed_at && !existing.last_sign_in_at) {
        const { error: resendError } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: redirectTo(origin),
          data: { display_name: displayName },
        })
        if (resendError) {
          await admin.from('crm_members').delete().eq('user_id', existing.id)
          return fail(origin, 502, 'invitacion', 'No pudimos enviar la invitación. Probá de nuevo en unos minutos.')
        }
        await audit(admin, actor, 'invitar', existing.id, { email, role_id: roleId })
        return reply(origin, 200, { estado: 'invitada', user_id: existing.id })
      }

      // Ya tiene cuenta activa en AVA (por ejemplo, como estudiante): la sumamos sin mandar email.
      await audit(admin, actor, 'sumar_cuenta_existente', existing.id, { email, role_id: roleId })
      return reply(origin, 200, { estado: 'agregada', user_id: existing.id })
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo(origin),
      data: { display_name: displayName },
    })
    if (inviteError || !invited.user) {
      const limit = inviteError?.status === 429
      return fail(
        origin,
        limit ? 429 : 502,
        limit ? 'limite' : 'invitacion',
        limit
          ? 'Se enviaron muchos emails seguidos. Esperá unos minutos y probá de nuevo.'
          : 'No pudimos enviar la invitación. Revisá que el email de Supabase esté configurado (ver README).',
      )
    }

    const { error: memberError } = await admin.from('crm_members').insert({
      user_id: invited.user.id,
      email,
      display_name: displayName,
      role_id: roleId,
      invited_by: actor.id,
    })
    if (memberError) {
      // Sin fila en el equipo la cuenta no sirve: la borramos para que se pueda invitar de nuevo.
      await admin.auth.admin.deleteUser(invited.user.id)
      return fail(origin, 500, 'base', 'No pudimos guardar a la persona en el equipo. Probá de nuevo.')
    }
    await audit(admin, actor, 'invitar', invited.user.id, { email, role_id: roleId })
    return reply(origin, 200, { estado: 'invitada', user_id: invited.user.id })
  }

  if (body.action === 'reenviar') {
    const userId = String(body.user_id ?? '')
    if (!UUID_RE.test(userId)) return fail(origin, 400, 'formato', 'Falta la persona.')
    const { data: member } = await admin
      .from('crm_members')
      .select('email, is_owner, active')
      .eq('user_id', userId)
      .maybeSingle()
    if (!member || member.is_owner) return fail(origin, 404, 'no_existe', 'Esa persona no está en el equipo.')
    if (!member.active) return fail(origin, 409, 'desactivada', 'Primero reactivá a la persona.')

    const { data: status } = await admin.rpc('crm_admin_users_status', { p_ids: [userId] })
    const account = (status as { email_confirmed_at: string | null; last_sign_in_at: string | null }[] | null)?.[0]
    if (account?.email_confirmed_at || account?.last_sign_in_at) {
      return fail(
        origin,
        409,
        'ya_acepto',
        'Esa persona ya aceptó la invitación. Si olvidó la contraseña, que use "Olvidé mi contraseña".',
      )
    }

    const { error } = await admin.auth.admin.inviteUserByEmail(member.email as string, {
      redirectTo: redirectTo(origin),
    })
    if (error) {
      return fail(
        origin,
        error.status === 429 ? 429 : 502,
        'invitacion',
        error.status === 429
          ? 'Se enviaron muchos emails seguidos. Esperá unos minutos y probá de nuevo.'
          : 'No pudimos reenviar la invitación. Probá de nuevo en unos minutos.',
      )
    }
    await audit(admin, actor, 'reenviar_invitacion', userId, { email: member.email as string })
    return reply(origin, 200, { ok: true })
  }

  return fail(origin, 400, 'accion', 'Acción desconocida.')
})
