-- CRM de AVA · Fase 3: emails con Resend, listos para enchufar.
--
-- Cada email pasa por una cola (crm_emails). La Edge Function crm-emails los manda con Resend.
-- Mientras no esté configurada la clave de Resend y el remitente, los emails quedan
-- "pendientes": el equipo los ve en el CRM y puede seguir confirmando a mano, como hasta ahora.
--
-- Confirmación de arrepentimiento y baja (Disposición 954/2025, 24 horas): cada pedido que
-- llega del sitio deja su email de confirmación en la cola. Si sale bien, el pedido queda
-- confirmado solo. Si alguien lo confirma a mano antes, el email pendiente se cancela.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Remitente y opciones
-- ---------------------------------------------------------------------------
create table public.crm_email_settings (
  id integer primary key default 1 check (id = 1),
  from_name text not null default 'AVA' check (char_length(btrim(from_name)) between 1 and 80),
  from_address text check (from_address is null or from_address ~ '^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$'),
  reply_to text check (reply_to is null or reply_to ~ '^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$'),
  auto_confirm boolean not null default true,
  -- Lo actualiza la Edge Function: si tiene la clave de Resend y el remitente cargado.
  provider_ready boolean not null default false,
  provider_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by_email text
);
insert into public.crm_email_settings (id) values (1);

alter table public.crm_email_settings enable row level security;
revoke all on public.crm_email_settings from anon, authenticated;
grant select on public.crm_email_settings to authenticated;
create policy crm_email_settings_select on public.crm_email_settings
  for select to authenticated using ((select crm_private.crm_is_member()));

-- ---------------------------------------------------------------------------
-- Plantillas
-- ---------------------------------------------------------------------------
create table public.crm_email_templates (
  key text primary key check (key ~ '^[a-z_]{3,60}$'),
  name text not null,
  description text not null default '',
  placeholders text[] not null default '{}',
  subject text not null check (char_length(btrim(subject)) between 1 and 300),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  updated_at timestamptz not null default now(),
  updated_by_email text
);

alter table public.crm_email_templates enable row level security;
revoke all on public.crm_email_templates from anon, authenticated;
grant select on public.crm_email_templates to authenticated;
create policy crm_email_templates_select on public.crm_email_templates
  for select to authenticated using ((select crm_private.crm_is_member()));

-- Los mismos textos que el CRM usaba para el email de confirmación redactado.
insert into public.crm_email_templates (key, name, description, placeholders, subject, body) values
(
  'confirmacion_arrepentimiento',
  'Confirmación de arrepentimiento',
  'Sale sola cuando alguien pide el arrepentimiento en el sitio.',
  array['nombre', 'codigo'],
  'AVA — Confirmación de tu pedido de arrepentimiento ({codigo})',
  E'Hola {nombre}:\n\nRecibimos tu pedido de arrepentimiento de la suscripción a AVA. El código de identificación de tu pedido es {codigo}.\n\nVamos a gestionar la devolución y te avisamos cuando esté hecha.\n\nCualquier duda, respondé este email.\n\nAVA'
),
(
  'confirmacion_baja',
  'Confirmación de baja',
  'Sale sola cuando alguien pide la baja en el sitio.',
  array['nombre', 'codigo'],
  'AVA — Confirmación de tu pedido de baja de servicio ({codigo})',
  E'Hola {nombre}:\n\nRecibimos tu pedido de baja de servicio de la suscripción a AVA. El código de identificación de tu pedido es {codigo}.\n\nTu suscripción no se va a renovar y mantenés el acceso hasta el final del año contratado.\n\nCualquier duda, respondé este email.\n\nAVA'
);

-- Reemplaza {clave} por su valor. Las claves que no vienen quedan vacías.
create function crm_private.crm_render(p_text text, p_values jsonb)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  v_out text := p_text;
  v_key text;
begin
  for v_key in select jsonb_object_keys(p_values) loop
    v_out := replace(v_out, '{' || v_key || '}', coalesce(p_values ->> v_key, ''));
  end loop;
  return regexp_replace(v_out, '\{[a-z_]+\}', '', 'g');
end;
$$;
revoke execute on function crm_private.crm_render(text, jsonb) from public, anon;
grant execute on function crm_private.crm_render(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Cola de emails
-- ---------------------------------------------------------------------------
create table public.crm_emails (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('confirmacion', 'manual', 'prueba')),
  template_key text references public.crm_email_templates (key) on delete set null,
  -- Si se borra a la persona, se borran sus emails: son datos personales.
  person_id uuid references public.crm_people (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  lead_source text,
  to_email text not null check (char_length(to_email) <= 320),
  subject text not null check (char_length(btrim(subject)) between 1 and 300),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  status text not null default 'pendiente' check (status in ('pendiente', 'enviando', 'enviado', 'fallido', 'cancelado')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text check (char_length(coalesce(last_error, '')) <= 1000),
  provider_id text,
  cancel_reason text check (char_length(coalesce(cancel_reason, '')) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create index crm_emails_queue_idx on public.crm_emails (next_attempt_at) where status = 'pendiente';
create index crm_emails_person_idx on public.crm_emails (person_id, created_at desc);
create index crm_emails_lead_idx on public.crm_emails (lead_id);
create index crm_emails_created_by_idx on public.crm_emails (created_by);
create index crm_emails_template_idx on public.crm_emails (template_key);

alter table public.crm_emails enable row level security;
revoke all on public.crm_emails from anon, authenticated;

create trigger set_updated_at before update on public.crm_emails
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.crm_email_templates
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.crm_email_settings
  for each row execute function public.set_updated_at();

-- Quién ve un email: los de pedidos, con "pedidos.gestionar"; el resto, con mensajes o personas.
create function crm_private.crm_can_see_email(p_lead_source text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case when crm_private.crm_is_request(p_lead_source)
    then crm_private.crm_has_permission('pedidos.gestionar')
    else crm_private.crm_has_permission('mensajes.ver') or crm_private.crm_has_permission('personas.ver') end
$$;

-- Quién escribe, manda o cancela: los de pedidos, con "pedidos.gestionar"; el resto, con "mensajes.responder".
create function crm_private.crm_can_handle_email(p_lead_source text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case when crm_private.crm_is_request(p_lead_source)
    then crm_private.crm_has_permission('pedidos.gestionar')
    else crm_private.crm_has_permission('mensajes.responder') end
$$;

revoke execute on function crm_private.crm_can_see_email(text), crm_private.crm_can_handle_email(text) from public, anon;
grant execute on function crm_private.crm_can_see_email(text), crm_private.crm_can_handle_email(text) to authenticated;

create function crm_private.crm_email_looks_valid(p_email text)
returns boolean language sql immutable set search_path = ''
as $$ select coalesce(btrim(p_email) ~ '^[^\s@<>",;:()\[\]\\]+@[^\s@<>",;:()\[\]\\]+\.[^\s@<>",;:()\[\]\\]+$', false) $$;

-- Cada pedido de arrepentimiento o baja deja su confirmación en la cola.
-- Si algo falla acá, el formulario del sitio se guarda igual: el pedido es lo primero.
create function crm_private.crm_queue_request_confirmation()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_template public.crm_email_templates;
  v_values jsonb;
begin
  if not crm_private.crm_is_request(new.source) or new.confirmed_at is not null
     or not crm_private.crm_email_looks_valid(new.email) then
    return null;
  end if;
  begin
    select * into v_template from public.crm_email_templates where key = 'confirmacion_' || new.source;
    if not found then
      return null;
    end if;
    v_values := jsonb_build_object('nombre', btrim(coalesce(new.name, '')), 'codigo', coalesce(new.request_code, ''));
    insert into public.crm_emails (kind, template_key, person_id, lead_id, lead_source, to_email, subject, body)
    values ('confirmacion', v_template.key, new.person_id, new.id, new.source, btrim(new.email),
            crm_private.crm_render(v_template.subject, v_values), crm_private.crm_render(v_template.body, v_values));
  exception when others then
    raise warning 'No se pudo encolar la confirmación del pedido %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger crm_queue_confirmation after insert on public.leads
  for each row execute function crm_private.crm_queue_request_confirmation();

-- Si alguien confirma el pedido a mano, el email automático ya no hace falta.
create function crm_private.crm_cancel_confirmation_when_confirmed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.crm_emails
  set status = 'cancelado', cancel_reason = 'El pedido se confirmó a mano'
  where lead_id = new.id and kind = 'confirmacion' and status = 'pendiente';
  return null;
end;
$$;

create trigger crm_cancel_confirmation after update of confirmed_at on public.leads
  for each row when (old.confirmed_at is null and new.confirmed_at is not null)
  execute function crm_private.crm_cancel_confirmation_when_confirmed();

revoke execute on function crm_private.crm_email_looks_valid(text), crm_private.crm_queue_request_confirmation(),
  crm_private.crm_cancel_confirmation_when_confirmed() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funciones para el equipo
-- ---------------------------------------------------------------------------
create function public.crm_emails_list()
returns table (
  id uuid, kind text, template_key text, person_id uuid, person_name text, lead_id uuid, lead_source text,
  to_email text, contact_hidden boolean, subject text, body text, status text, attempts integer,
  last_error text, cancel_reason text, created_by_email text, created_at timestamptz, sent_at timestamptz,
  can_handle boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_contact boolean;
begin
  perform crm_private.crm_require(crm_private.crm_is_member());
  v_contact := crm_private.crm_has_permission('personas.ver_contacto');
  return query
  select e.id, e.kind, e.template_key, e.person_id,
         nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
         e.lead_id, e.lead_source,
         case when v_contact or e.kind = 'prueba' then e.to_email end,
         not (v_contact or e.kind = 'prueba'),
         e.subject, e.body, e.status, e.attempts, e.last_error, e.cancel_reason, e.created_by_email,
         e.created_at, e.sent_at, crm_private.crm_can_handle_email(e.lead_source)
  from public.crm_emails e
  left join public.crm_people p on p.id = e.person_id
  where (e.kind = 'prueba' and crm_private.crm_has_permission('configuracion.editar'))
     or (e.kind <> 'prueba' and crm_private.crm_can_see_email(e.lead_source))
  order by e.created_at desc
  limit 1000;
end;
$$;

-- Escribir un email a una persona. La dirección la pone la base: no hace falta verla.
create function public.crm_email_compose(p_person_id uuid, p_subject text, p_body text, p_lead_id uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_person public.crm_people;
  v_source text;
  v_to text;
  v_id uuid;
begin
  perform crm_private.crm_require(crm_private.crm_is_member());
  select * into v_person from public.crm_people where id = p_person_id;
  if not found then
    raise exception 'La persona no existe' using errcode = 'P0002';
  end if;
  if p_lead_id is not null then
    select l.source into v_source from public.leads l where l.id = p_lead_id and l.person_id = p_person_id;
    if v_source is null then
      raise exception 'El mensaje no existe' using errcode = 'P0002';
    end if;
  end if;
  perform crm_private.crm_require(crm_private.crm_can_handle_email(v_source));
  if nullif(btrim(coalesce(p_subject, '')), '') is null or nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'Escribí el asunto y el texto del email' using errcode = '23514';
  end if;
  if char_length(p_subject) > 300 or char_length(p_body) > 20000 then
    raise exception 'El email es demasiado largo' using errcode = '22001';
  end if;
  v_to := btrim(coalesce(v_person.email, ''));
  if not crm_private.crm_email_looks_valid(v_to) then
    raise exception 'La persona no tiene un email válido' using errcode = '23514';
  end if;

  insert into public.crm_emails (kind, person_id, lead_id, lead_source, to_email, subject, body, created_by, created_by_email)
  select 'manual', p_person_id, p_lead_id, v_source, v_to, btrim(p_subject), btrim(p_body), auth.uid(), m.email
  from public.crm_members m where m.user_id = auth.uid()
  returning id into v_id;

  update public.crm_people set last_activity_at = greatest(last_activity_at, now()) where id = p_person_id;
  perform crm_private.crm_audit('escribir_email', 'crm_emails', v_id::text,
    jsonb_strip_nulls(jsonb_build_object('persona', p_person_id, 'tipo', v_source)));
  return v_id;
end;
$$;

create function public.crm_email_cancel(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email public.crm_emails;
begin
  perform crm_private.crm_require(crm_private.crm_is_member());
  select * into v_email from public.crm_emails where id = p_id;
  if not found then
    raise exception 'El email no existe' using errcode = 'P0002';
  end if;
  perform crm_private.crm_require(
    case when v_email.kind = 'prueba' then crm_private.crm_has_permission('configuracion.editar')
         else crm_private.crm_can_handle_email(v_email.lead_source) end);
  if v_email.status not in ('pendiente', 'fallido') then
    raise exception 'Ese email ya salió o ya está cancelado' using errcode = '23514';
  end if;
  update public.crm_emails set status = 'cancelado', cancel_reason = 'Lo canceló ' || coalesce(
    (select m.email from public.crm_members m where m.user_id = auth.uid()), 'el equipo')
  where id = p_id;
  perform crm_private.crm_audit('cancelar_email', 'crm_emails', p_id::text,
    jsonb_strip_nulls(jsonb_build_object('clase', v_email.kind, 'persona', v_email.person_id)));
end;
$$;

-- La Edge Function la llama con la sesión de quien pide "Enviar ahora": revisa el permiso
-- y vuelve a poner en cola un email fallido.
create function public.crm_email_request_send(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email public.crm_emails;
begin
  perform crm_private.crm_require(crm_private.crm_is_member());
  select * into v_email from public.crm_emails where id = p_id;
  if not found then
    raise exception 'El email no existe' using errcode = 'P0002';
  end if;
  perform crm_private.crm_require(
    case when v_email.kind = 'prueba' then crm_private.crm_has_permission('configuracion.editar')
         else crm_private.crm_can_handle_email(v_email.lead_source) end);
  if v_email.status not in ('pendiente', 'fallido') then
    raise exception 'Ese email ya salió o ya está cancelado' using errcode = '23514';
  end if;
  update public.crm_emails set status = 'pendiente', next_attempt_at = now(), attempts = least(attempts, 2)
  where id = p_id;
end;
$$;

create function public.crm_email_template_save(p_key text, p_subject text, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('configuracion.editar'));
  update public.crm_email_templates set
    subject = btrim(p_subject), body = btrim(p_body),
    updated_by_email = (select m.email from public.crm_members m where m.user_id = auth.uid())
  where key = p_key and (subject is distinct from btrim(p_subject) or body is distinct from btrim(p_body));
  if found then
    perform crm_private.crm_audit('editar_plantilla', 'crm_email_templates', p_key, '{}'::jsonb);
  elsif not exists (select 1 from public.crm_email_templates where key = p_key) then
    raise exception 'La plantilla no existe' using errcode = 'P0002';
  end if;
end;
$$;

create function public.crm_email_settings_save(p_from_name text, p_from_address text, p_reply_to text, p_auto_confirm boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.crm_email_settings;
  v_changed text[] := '{}';
  v_from text := nullif(lower(btrim(coalesce(p_from_address, ''))), '');
  v_reply text := nullif(lower(btrim(coalesce(p_reply_to, ''))), '');
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('configuracion.editar'));
  select * into v_old from public.crm_email_settings where id = 1;
  if btrim(coalesce(p_from_name, '')) is distinct from v_old.from_name then v_changed := array_append(v_changed, 'nombre_remitente'); end if;
  if v_from is distinct from v_old.from_address then v_changed := array_append(v_changed, 'email_remitente'); end if;
  if v_reply is distinct from v_old.reply_to then v_changed := array_append(v_changed, 'responder_a'); end if;
  if coalesce(p_auto_confirm, true) is distinct from v_old.auto_confirm then v_changed := array_append(v_changed, 'confirmacion_automatica'); end if;
  if cardinality(v_changed) = 0 then
    return;
  end if;
  update public.crm_email_settings set
    from_name = btrim(coalesce(p_from_name, '')), from_address = v_from, reply_to = v_reply,
    auto_confirm = coalesce(p_auto_confirm, true),
    -- Con otro remitente hay que volver a probar la conexión.
    provider_ready = case when v_from is distinct from v_old.from_address then false else provider_ready end,
    updated_by_email = (select m.email from public.crm_members m where m.user_id = auth.uid())
  where id = 1;
  perform crm_private.crm_audit('editar_config_email', 'crm_email_settings', '1', jsonb_build_object('campos', to_jsonb(v_changed)));
end;
$$;

-- Email de prueba a una dirección del equipo, para comprobar que Resend funciona.
create function public.crm_email_test(p_to text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('configuracion.editar'));
  if not crm_private.crm_email_looks_valid(p_to) then
    raise exception 'Escribí un email válido' using errcode = '23514';
  end if;
  insert into public.crm_emails (kind, to_email, subject, body, created_by, created_by_email)
  select 'prueba', btrim(p_to), 'Prueba de envío del CRM de AVA',
         E'Si te llegó este email, el CRM ya puede mandar emails con Resend.\n\nAVA', auth.uid(), m.email
  from public.crm_members m where m.user_id = auth.uid()
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.crm_emails_list(), public.crm_email_compose(uuid, text, text, uuid),
  public.crm_email_cancel(uuid), public.crm_email_request_send(uuid), public.crm_email_template_save(text, text, text),
  public.crm_email_settings_save(text, text, text, boolean), public.crm_email_test(text)
from public, anon;
grant execute on function public.crm_emails_list(), public.crm_email_compose(uuid, text, text, uuid),
  public.crm_email_cancel(uuid), public.crm_email_request_send(uuid), public.crm_email_template_save(text, text, text),
  public.crm_email_settings_save(text, text, text, boolean), public.crm_email_test(text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Funciones para la Edge Function (solo service_role)
-- ---------------------------------------------------------------------------
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'crm_cron_token',
  'Token con el que el cron del CRM llama a la Edge Function crm-emails');

create function public.crm_cron_token_ok(p_token text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'crm_cron_token' and p_token is not null and s.decrypted_secret = p_token
  )
$$;

-- Toma los emails que tocan mandar y los marca "enviando" para que otro proceso no los repita.
-- Automáticos: los pendientes de los últimos 7 días. Los más viejos esperan un "Enviar ahora".
create function public.crm_email_claim(p_ids uuid[] default null, p_limit integer default 20)
returns table (id uuid, kind text, lead_id uuid, to_email text, subject text, body text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_auto_confirm boolean := (select s.auto_confirm from public.crm_email_settings s where s.id = 1);
begin
  -- Un envío que quedó colgado vuelve a la cola.
  update public.crm_emails e set status = 'pendiente'
  where e.status = 'enviando' and e.claimed_at < now() - interval '10 minutes';

  return query
  with picked as (
    select e.id from public.crm_emails e
    where e.status = 'pendiente'
      and (
        (p_ids is not null and e.id = any (p_ids))
        or (p_ids is null and e.next_attempt_at <= now() and e.created_at > now() - interval '7 days'
            and (e.kind <> 'confirmacion' or v_auto_confirm))
      )
    order by e.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    for update skip locked
  )
  update public.crm_emails e
  set status = 'enviando', attempts = e.attempts + 1, claimed_at = now()
  from picked
  where e.id = picked.id
  returning e.id, e.kind, e.lead_id, e.to_email, e.subject, e.body;
end;
$$;

-- Resultado de cada envío. Si sale bien una confirmación, el pedido queda confirmado.
create function public.crm_email_mark(p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email public.crm_emails;
  v_lead record;
begin
  select * into v_email from public.crm_emails where id = p_id;
  if not found or v_email.status <> 'enviando' then
    return;
  end if;
  if p_ok then
    update public.crm_emails set status = 'enviado', sent_at = now(), provider_id = left(p_provider_id, 200), last_error = null
    where id = p_id;
    if v_email.kind = 'confirmacion' and v_email.lead_id is not null then
      update public.leads set confirmed_at = now() where id = v_email.lead_id and confirmed_at is null
      returning source, request_code into v_lead;
      if found then
        insert into public.crm_audit_log (actor_id, actor_email, action, entity, entity_id, detail)
        values (null, null, 'confirmar_pedido', 'leads', v_email.lead_id::text,
                jsonb_build_object('tipo', v_lead.source, 'codigo', v_lead.request_code, 'via', 'email automatico'));
      end if;
    end if;
  else
    -- Tres intentos: a los 5 minutos, a los 30 y después queda como fallido.
    update public.crm_emails set
      status = case when attempts >= 3 then 'fallido' else 'pendiente' end,
      next_attempt_at = now() + case when attempts >= 2 then interval '30 minutes' else interval '5 minutes' end,
      last_error = left(coalesce(p_error, 'Error desconocido'), 1000)
    where id = p_id;
  end if;
end;
$$;

create function public.crm_email_provider_status(p_ready boolean)
returns table (from_name text, from_address text, reply_to text)
language sql security definer set search_path = ''
as $$
  update public.crm_email_settings s set provider_ready = p_ready, provider_checked_at = now()
  where s.id = 1
  returning s.from_name, s.from_address, s.reply_to
$$;

revoke execute on function public.crm_cron_token_ok(text), public.crm_email_claim(uuid[], integer),
  public.crm_email_mark(uuid, boolean, text, text), public.crm_email_provider_status(boolean)
from public, anon, authenticated;
grant execute on function public.crm_cron_token_ok(text), public.crm_email_claim(uuid[], integer),
  public.crm_email_mark(uuid, boolean, text, text), public.crm_email_provider_status(boolean)
to service_role;

-- ---------------------------------------------------------------------------
-- Cron: cada minuto, si hay emails en la cola, despierta a la Edge Function.
-- Mientras Resend no esté listo, la despierta cada 30 minutos para volver a revisar.
-- ---------------------------------------------------------------------------
create function crm_private.crm_email_tick()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_settings public.crm_email_settings;
begin
  if not exists (
    select 1 from public.crm_emails
    where status = 'pendiente' and next_attempt_at <= now() and created_at > now() - interval '7 days'
  ) then
    return;
  end if;
  select * into v_settings from public.crm_email_settings where id = 1;
  if not v_settings.provider_ready and v_settings.provider_checked_at > now() - interval '30 minutes' then
    return;
  end if;
  perform net.http_post(
    url := 'https://mryuhzpenzpyhfidwsup.supabase.co/functions/v1/crm-emails',
    body := jsonb_build_object('action', 'procesar'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-crm-cron', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'crm_cron_token')
    ),
    timeout_milliseconds := 20000
  );
end;
$$;
revoke execute on function crm_private.crm_email_tick() from public, anon, authenticated;

select cron.schedule('crm-emails', '* * * * *', 'select crm_private.crm_email_tick()');

-- ---------------------------------------------------------------------------
-- La ficha suma los emails y Hoy avisa si hay emails con error.
-- ---------------------------------------------------------------------------
create or replace function public.crm_person_detail(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_contact boolean;
  v_rights boolean;
  v_result jsonb;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('personas.ver'));
  v_contact := crm_private.crm_has_permission('personas.ver_contacto');
  v_rights := crm_private.crm_has_permission('derechos.gestionar');

  select jsonb_build_object(
    'person', jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
      'email', case when v_contact then p.email end,
      'phone', case when v_contact then p.phone end,
      'contact_hidden', not v_contact,
      'country', p.country, 'tags', to_jsonb(p.tags),
      'created_at', p.created_at, 'last_activity_at', p.last_activity_at
    ),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'created_at', l.created_at, 'source', l.source, 'motivo', l.motivo,
        'message', l.message, 'status', l.status, 'request_code', l.request_code,
        'confirmed_at', l.confirmed_at, 'privacy_consent', l.privacy_consent,
        'publish_consent', l.publish_consent, 'adult_confirmed', l.adult_confirmed,
        'expires_at', crm_private.crm_lead_expires_at(l.source, l.created_at, p.last_activity_at)
      ) order by l.created_at desc)
      from public.leads l
      where l.person_id = p.id and crm_private.crm_can_see_source(l.source)
    ), '[]'::jsonb),
    'hidden_messages', (
      select count(*) from public.leads l
      where l.person_id = p.id and not crm_private.crm_can_see_source(l.source)
    ),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'author_email', n.author_email, 'created_at', n.created_at
      ) order by n.created_at desc)
      from public.crm_person_notes n where n.person_id = p.id
    ), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'granted', c.granted, 'source', c.source,
        'recorded_at', c.recorded_at, 'recorded_by_email', c.recorded_by_email
      ) order by c.recorded_at desc, c.id)
      from public.crm_consents c where c.person_id = p.id
    ), '[]'::jsonb),
    'data_requests', case when v_rights then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'code', r.code, 'kind', r.kind, 'status', r.status,
        'received_at', r.received_at, 'due_date', r.due_date, 'resolved_at', r.resolved_at
      ) order by r.received_at desc)
      from public.crm_data_requests r where r.person_id = p.id
    ), '[]'::jsonb) end,
    'emails', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'kind', e.kind, 'lead_source', e.lead_source, 'subject', e.subject, 'body', e.body,
        'status', e.status, 'created_at', e.created_at, 'sent_at', e.sent_at,
        'created_by_email', e.created_by_email, 'last_error', e.last_error, 'cancel_reason', e.cancel_reason
      ) order by e.created_at desc)
      from public.crm_emails e
      where e.person_id = p.id and crm_private.crm_can_see_email(e.lead_source)
    ), '[]'::jsonb)
  ) into v_result
  from public.crm_people p where p.id = p_id;

  if v_result is null then
    raise exception 'La persona no existe' using errcode = 'P0002';
  end if;
  perform crm_private.crm_audit('ver_persona', 'crm_people', p_id::text,
    jsonb_build_object('con_contacto', v_contact));
  return v_result;
end;
$$;

create or replace function public.crm_today()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := crm_private.crm_today_ar();
  v_result jsonb := jsonb_build_object('today', v_today);
begin
  perform crm_private.crm_require(crm_private.crm_is_member());

  if crm_private.crm_has_permission('pedidos.gestionar') then
    v_result := v_result || jsonb_build_object('requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'source', l.source, 'request_code', l.request_code, 'name', l.name,
        'created_at', l.created_at, 'deadline', l.created_at + interval '24 hours',
        'email_status', (
          select e.status from public.crm_emails e
          where e.lead_id = l.id and e.kind = 'confirmacion' order by e.created_at desc limit 1
        )
      ) order by l.created_at)
      from public.leads l
      where crm_private.crm_is_request(l.source) and l.confirmed_at is null
    ), '[]'::jsonb));
  end if;

  if crm_private.crm_has_permission('derechos.gestionar') then
    v_result := v_result || jsonb_build_object(
      'data_requests', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'code', r.code, 'kind', r.kind,
          'name', coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), r.requester_name),
          'due_date', r.due_date, 'days_left', r.due_date - v_today, 'identity_verified', r.identity_verified
        ) order by r.due_date, r.received_at)
        from public.crm_data_requests r
        left join public.crm_people p on p.id = r.person_id
        where r.status = 'pendiente'
      ), '[]'::jsonb),
      'missing_holiday_years', to_jsonb(crm_private.crm_missing_holiday_years(v_today, v_today + 15))
    );
  end if;

  if crm_private.crm_has_permission('mensajes.ver') then
    v_result := v_result || jsonb_build_object('unread', coalesce((
      select jsonb_agg(u order by u.created_at desc) from (
        select l.id, l.source, l.name, l.motivo, l.created_at
        from public.leads l
        where l.status = 'nuevo' and not crm_private.crm_is_request(l.source)
        order by l.created_at desc
        limit 5
      ) u
    ), '[]'::jsonb),
    'unread_count', (
      select count(*) from public.leads l
      where l.status = 'nuevo' and not crm_private.crm_is_request(l.source)
    ));
  end if;

  if crm_private.crm_has_permission('personas.borrar') then
    v_result := v_result || jsonb_build_object('expired_count', (
      select count(*) from public.leads l
      left join public.crm_people p on p.id = l.person_id
      where crm_private.crm_lead_expires_at(l.source, l.created_at, p.last_activity_at) <= now()
        and crm_private.crm_can_see_source(l.source)
    ));
  end if;

  if crm_private.crm_has_permission('pedidos.gestionar') or crm_private.crm_has_permission('mensajes.responder') then
    v_result := v_result || jsonb_build_object(
      'failed_emails', (
        select count(*) from public.crm_emails e
        where e.status = 'fallido' and e.kind <> 'prueba' and crm_private.crm_can_handle_email(e.lead_source)
      ),
      'email_ready', (select s.provider_ready from public.crm_email_settings s where s.id = 1)
    );
  end if;

  return v_result;
end;
$$;
