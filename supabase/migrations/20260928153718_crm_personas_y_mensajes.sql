-- CRM de AVA · Fase 1: personas y mensajes.
--
-- Cada formulario del sitio que llega a leads queda asociado a una persona (crm_people),
-- una por email. El sitio no cambia: un trigger completa leads.person_id al insertar.
--
-- El equipo no lee leads ni crm_people directamente. Todo pasa por funciones que:
--   1. revisan el permiso de quien llama,
--   2. ocultan email y teléfono a quien no tiene "personas.ver_contacto",
--   3. muestran los pedidos de arrepentimiento y baja solo con "pedidos.gestionar",
--   4. dejan constancia en la auditoría de lo sensible (ver una ficha, confirmar, borrar).
-- Núcleo sigue leyendo leads con sus políticas de admin, sin cambios.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.crm_people (
  id uuid primary key default gen_random_uuid(),
  email_normalized text unique check (email_normalized is null or email_normalized = lower(btrim(email_normalized))),
  email text check (char_length(coalesce(email, '')) <= 320),
  first_name text check (char_length(coalesce(first_name, '')) <= 200),
  last_name text check (char_length(coalesce(last_name, '')) <= 200),
  phone text check (char_length(coalesce(phone, '')) <= 40),
  country text check (char_length(coalesce(country, '')) <= 100),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create index crm_people_last_activity_idx on public.crm_people (last_activity_at desc);

create table public.crm_person_notes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.crm_people (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_email text,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index crm_person_notes_person_idx on public.crm_person_notes (person_id, created_at desc);
create index crm_person_notes_author_idx on public.crm_person_notes (author_id);

-- Columna opcional: el sitio no la envía y el trigger la completa siempre.
alter table public.leads add column person_id uuid references public.crm_people (id) on delete set null;
create index leads_person_id_idx on public.leads (person_id);

create trigger set_updated_at before update on public.crm_people
  for each row execute function public.set_updated_at();

-- Sin políticas: nadie lee ni escribe estas tablas desde la API. Solo las funciones de abajo.
alter table public.crm_people enable row level security;
alter table public.crm_person_notes enable row level security;
revoke all on public.crm_people, public.crm_person_notes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Asociar cada lead a su persona
-- ---------------------------------------------------------------------------
create function crm_private.crm_upsert_person_from_lead(
  p_email text, p_name text, p_last_name text, p_phone text, p_country text, p_at timestamptz
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_id uuid;
begin
  if v_email is null then
    return null;
  end if;
  insert into public.crm_people (email_normalized, email, first_name, last_name, phone, country, created_at, last_activity_at)
  values (
    v_email, btrim(p_email),
    nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_last_name, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_country, '')), ''),
    p_at, p_at
  )
  on conflict (email_normalized) do update set
    -- Completa lo que falta; lo que ya estaba (o lo que corrigió el equipo) no se pisa.
    first_name = coalesce(public.crm_people.first_name, excluded.first_name),
    last_name = coalesce(public.crm_people.last_name, excluded.last_name),
    phone = coalesce(public.crm_people.phone, excluded.phone),
    country = coalesce(public.crm_people.country, excluded.country),
    last_activity_at = greatest(public.crm_people.last_activity_at, excluded.last_activity_at)
  returning id into v_id;
  return v_id;
end;
$$;

create function crm_private.crm_link_lead()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Se ignora cualquier person_id que mande el formulario.
  new.person_id := crm_private.crm_upsert_person_from_lead(
    new.email, new.name, new.last_name, new.phone, new.country, coalesce(new.created_at, now())
  );
  return new;
end;
$$;

revoke execute on function crm_private.crm_upsert_person_from_lead(text, text, text, text, text, timestamptz),
  crm_private.crm_link_lead() from public, anon, authenticated;

create trigger crm_link_lead before insert on public.leads
  for each row execute function crm_private.crm_link_lead();

-- Los mensajes que ya existían.
update public.leads l
set person_id = crm_private.crm_upsert_person_from_lead(l.email, l.name, l.last_name, l.phone, l.country, l.created_at)
where l.person_id is null;

-- ---------------------------------------------------------------------------
-- Reglas de acceso comunes
-- ---------------------------------------------------------------------------
create function crm_private.crm_is_request(p_source text)
returns boolean language sql immutable set search_path = ''
as $$ select p_source in ('arrepentimiento', 'baja') $$;

-- Puede ver este tipo de mensaje: pedidos con "pedidos.gestionar"; el resto con "mensajes.ver".
create function crm_private.crm_can_see_source(p_source text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case when crm_private.crm_is_request(p_source)
    then crm_private.crm_has_permission('pedidos.gestionar')
    else crm_private.crm_has_permission('mensajes.ver') end
$$;

-- Puede responder, archivar y anotar este tipo de mensaje.
create function crm_private.crm_can_handle_source(p_source text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case when crm_private.crm_is_request(p_source)
    then crm_private.crm_has_permission('pedidos.gestionar')
    else crm_private.crm_has_permission('mensajes.responder') end
$$;

create function crm_private.crm_require(p_ok boolean)
returns void language plpgsql volatile set search_path = ''
as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'No tenés permiso para hacer esto' using errcode = '42501';
  end if;
end;
$$;

create function crm_private.crm_audit(p_action text, p_entity text, p_entity_id text, p_detail jsonb)
returns void language sql security definer set search_path = ''
as $$
  insert into public.crm_audit_log (actor_id, actor_email, action, entity, entity_id, detail)
  select auth.uid(), (select m.email from public.crm_members m where m.user_id = auth.uid()),
         p_action, p_entity, p_entity_id, coalesce(p_detail, '{}'::jsonb);
$$;

revoke execute on function crm_private.crm_is_request(text), crm_private.crm_can_see_source(text),
  crm_private.crm_can_handle_source(text), crm_private.crm_require(boolean),
  crm_private.crm_audit(text, text, text, jsonb) from public, anon;
grant execute on function crm_private.crm_is_request(text), crm_private.crm_can_see_source(text),
  crm_private.crm_can_handle_source(text), crm_private.crm_require(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Mensajes
-- ---------------------------------------------------------------------------
create function public.crm_messages_list()
returns table (
  id uuid, created_at timestamptz, source text, name text, last_name text,
  email text, phone text, contact_hidden boolean, country text, motivo text, message text,
  status text, notes text, request_code text, confirmed_at timestamptz,
  privacy_consent boolean, publish_consent boolean, adult_confirmed boolean,
  person_id uuid, can_handle boolean
)
language sql stable security definer set search_path = ''
as $$
  with me as (select crm_private.crm_has_permission('personas.ver_contacto') as contact)
  select l.id, l.created_at, l.source, l.name, l.last_name,
         case when me.contact then l.email end,
         case when me.contact then l.phone end,
         not me.contact,
         l.country, l.motivo, l.message, l.status, l.notes, l.request_code, l.confirmed_at,
         l.privacy_consent, l.publish_consent, l.adult_confirmed, l.person_id,
         crm_private.crm_can_handle_source(l.source)
  from public.leads l, me
  where crm_private.crm_is_member() and crm_private.crm_can_see_source(l.source)
  order by l.created_at desc;
$$;

create function public.crm_messages_unread_count()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.leads l
  where l.status = 'nuevo' and crm_private.crm_is_member() and crm_private.crm_can_see_source(l.source);
$$;

create function public.crm_message_update(p_id uuid, p_status text default null, p_notes text default null, p_set_notes boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_source text;
begin
  select l.source into v_source from public.leads l where l.id = p_id;
  if v_source is null then
    raise exception 'El mensaje no existe' using errcode = 'P0002';
  end if;
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_can_handle_source(v_source));
  if p_status is not null and p_status not in ('nuevo', 'leido', 'archivado') then
    raise exception 'Estado inválido' using errcode = '23514';
  end if;
  update public.leads l set
    status = coalesce(p_status, l.status),
    notes = case when p_set_notes then nullif(btrim(coalesce(p_notes, '')), '') else l.notes end
  where l.id = p_id;
end;
$$;

create function public.crm_message_confirm(p_id uuid)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_lead record;
begin
  select l.source, l.request_code, l.confirmed_at into v_lead from public.leads l where l.id = p_id;
  if not found then
    raise exception 'El pedido no existe' using errcode = 'P0002';
  end if;
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('pedidos.gestionar'));
  if not crm_private.crm_is_request(v_lead.source) then
    raise exception 'Solo se confirman pedidos de arrepentimiento o baja' using errcode = '23514';
  end if;
  if v_lead.confirmed_at is not null then
    return v_lead.confirmed_at;
  end if;
  update public.leads l set confirmed_at = now() where l.id = p_id;
  perform crm_private.crm_audit('confirmar_pedido', 'leads', p_id::text,
    jsonb_build_object('tipo', v_lead.source, 'codigo', v_lead.request_code));
  return now();
end;
$$;

create function public.crm_message_delete(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_lead record;
begin
  select l.source, l.request_code, l.person_id into v_lead from public.leads l where l.id = p_id;
  if not found then
    raise exception 'El mensaje no existe' using errcode = 'P0002';
  end if;
  perform crm_private.crm_require(crm_private.crm_is_member()
    and crm_private.crm_has_permission('personas.borrar') and crm_private.crm_can_see_source(v_lead.source));
  delete from public.leads l where l.id = p_id;
  -- Sin datos personales en la constancia: solo el tipo y el código del pedido.
  perform crm_private.crm_audit('borrar_mensaje', 'leads', p_id::text,
    jsonb_strip_nulls(jsonb_build_object('tipo', v_lead.source, 'codigo', v_lead.request_code, 'persona', v_lead.person_id)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Personas
-- ---------------------------------------------------------------------------
create function public.crm_people_list()
returns table (
  id uuid, first_name text, last_name text, email text, phone text, contact_hidden boolean,
  country text, tags text[], created_at timestamptz, last_activity_at timestamptz,
  message_count integer, sources text[]
)
language sql stable security definer set search_path = ''
as $$
  with me as (select crm_private.crm_has_permission('personas.ver_contacto') as contact)
  select p.id, p.first_name, p.last_name,
         case when me.contact then p.email end,
         case when me.contact then p.phone end,
         not me.contact,
         p.country, p.tags, p.created_at, p.last_activity_at,
         (select count(*)::integer from public.leads l where l.person_id = p.id),
         coalesce((select array_agg(distinct l.source order by l.source) from public.leads l where l.person_id = p.id), '{}')
  from public.crm_people p, me
  where crm_private.crm_is_member() and crm_private.crm_has_permission('personas.ver')
  order by p.last_activity_at desc;
$$;

create function public.crm_person_detail(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_contact boolean;
  v_result jsonb;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('personas.ver'));
  v_contact := crm_private.crm_has_permission('personas.ver_contacto');

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
        'publish_consent', l.publish_consent, 'adult_confirmed', l.adult_confirmed
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

create function public.crm_person_update(
  p_id uuid, p_first_name text, p_last_name text, p_country text, p_tags text[],
  p_email text default null, p_phone text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.crm_people;
  v_contact boolean;
  v_email text;
  v_changed text[] := '{}';
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('personas.editar'));
  select * into v_old from public.crm_people where id = p_id;
  if not found then
    raise exception 'La persona no existe' using errcode = 'P0002';
  end if;
  v_contact := crm_private.crm_has_permission('personas.ver_contacto');

  -- Email y teléfono solo los cambia quien los puede ver.
  v_email := case when v_contact then nullif(btrim(coalesce(p_email, '')), '') else v_old.email end;

  if nullif(btrim(coalesce(p_first_name, '')), '') is distinct from v_old.first_name then v_changed := v_changed || 'nombre'; end if;
  if nullif(btrim(coalesce(p_last_name, '')), '') is distinct from v_old.last_name then v_changed := v_changed || 'apellido'; end if;
  if nullif(btrim(coalesce(p_country, '')), '') is distinct from v_old.country then v_changed := v_changed || 'pais'; end if;
  if coalesce(p_tags, '{}') is distinct from v_old.tags then v_changed := v_changed || 'etiquetas'; end if;
  if v_contact and v_email is distinct from v_old.email then v_changed := v_changed || 'email'; end if;
  if v_contact and nullif(btrim(coalesce(p_phone, '')), '') is distinct from v_old.phone then v_changed := v_changed || 'telefono'; end if;

  if cardinality(v_changed) = 0 then
    return;
  end if;

  update public.crm_people set
    first_name = nullif(btrim(coalesce(p_first_name, '')), ''),
    last_name = nullif(btrim(coalesce(p_last_name, '')), ''),
    country = nullif(btrim(coalesce(p_country, '')), ''),
    tags = (select coalesce(array_agg(distinct t order by t), '{}')
            from unnest(coalesce(p_tags, '{}')) as u(raw), lateral (select btrim(lower(raw)) as t) x
            where t <> '' and char_length(t) <= 40),
    email = v_email,
    email_normalized = case when v_contact then lower(v_email) else email_normalized end,
    phone = case when v_contact then nullif(btrim(coalesce(p_phone, '')), '') else phone end
  where id = p_id;

  -- Solo los nombres de los campos: la auditoría no guarda los datos personales.
  perform crm_private.crm_audit('editar_persona', 'crm_people', p_id::text, jsonb_build_object('campos', to_jsonb(v_changed)));
end;
$$;

create function public.crm_person_add_note(p_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('personas.editar'));
  if not exists (select 1 from public.crm_people where id = p_id) then
    raise exception 'La persona no existe' using errcode = 'P0002';
  end if;
  insert into public.crm_person_notes (person_id, author_id, author_email, body)
  select p_id, auth.uid(), m.email, btrim(p_body)
  from public.crm_members m where m.user_id = auth.uid()
  returning id into v_id;
  update public.crm_people set last_activity_at = now() where id = p_id;
  return v_id;
end;
$$;

create function public.crm_person_delete(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_messages integer;
  v_notes integer;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('personas.borrar'));
  if not exists (select 1 from public.crm_people where id = p_id) then
    raise exception 'La persona no existe' using errcode = 'P0002';
  end if;
  select count(*) into v_messages from public.leads where person_id = p_id;
  select count(*) into v_notes from public.crm_person_notes where person_id = p_id;
  delete from public.leads where person_id = p_id;
  delete from public.crm_people where id = p_id;
  perform crm_private.crm_audit('borrar_persona', 'crm_people', p_id::text,
    jsonb_build_object('mensajes', v_messages, 'notas', v_notes));
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución: solo personas logueadas; cada función revisa el permiso del CRM.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.crm_messages_list(), public.crm_messages_unread_count(),
  public.crm_message_update(uuid, text, text, boolean), public.crm_message_confirm(uuid),
  public.crm_message_delete(uuid), public.crm_people_list(), public.crm_person_detail(uuid),
  public.crm_person_update(uuid, text, text, text, text[], text, text),
  public.crm_person_add_note(uuid, text), public.crm_person_delete(uuid)
from public, anon;
grant execute on function
  public.crm_messages_list(), public.crm_messages_unread_count(),
  public.crm_message_update(uuid, text, text, boolean), public.crm_message_confirm(uuid),
  public.crm_message_delete(uuid), public.crm_people_list(), public.crm_person_detail(uuid),
  public.crm_person_update(uuid, text, text, text, text[], text, text),
  public.crm_person_add_note(uuid, text), public.crm_person_delete(uuid)
to authenticated;
