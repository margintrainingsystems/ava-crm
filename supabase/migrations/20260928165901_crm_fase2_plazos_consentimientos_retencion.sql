-- CRM de AVA · Fase 2: Hoy, pedidos de datos, días hábiles, consentimientos y retención.
--
-- Todo plazo sale de la base:
--   · Pedidos de datos (Ley 25.326): acceso en 10 días corridos (art. 14); rectificación,
--     actualización y supresión en 5 días hábiles (art. 16). Los días hábiles saltean
--     sábados, domingos y los feriados que la dueña carga desde Núcleo.
--   · Arrepentimiento y baja: confirmación dentro de las 24 horas (Disposición 954/2025).
--   · Retención, según la Política de privacidad publicada: contacto 2 años desde el último
--     intercambio; arrepentimiento y baja 3 años; lista de espera hasta el sorteo (fase 4).
--     Un pedido de datos o un retiro de consentimiento no cuentan como intercambio: no estiran el plazo.
-- La retención marca lo vencido. Borrar sigue siendo una decisión de una persona del equipo.

-- ---------------------------------------------------------------------------
-- Feriados: los carga la dueña desde Núcleo. El equipo los lee.
-- ---------------------------------------------------------------------------
create table public.crm_holidays (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

alter table public.crm_holidays enable row level security;
revoke all on public.crm_holidays from anon;
grant select, insert, update, delete on public.crm_holidays to authenticated;

create policy crm_holidays_select on public.crm_holidays
  for select to authenticated using ((select crm_private.crm_is_member()));
create policy crm_holidays_insert on public.crm_holidays
  for insert to authenticated with check ((select crm_private.crm_is_owner()));
create policy crm_holidays_update on public.crm_holidays
  for update to authenticated using ((select crm_private.crm_is_owner())) with check ((select crm_private.crm_is_owner()));
create policy crm_holidays_delete on public.crm_holidays
  for delete to authenticated using ((select crm_private.crm_is_owner()));

create trigger crm_audit after insert or update or delete on public.crm_holidays
  for each row execute function public.crm_audit_changes();

-- ---------------------------------------------------------------------------
-- Días hábiles
-- ---------------------------------------------------------------------------
create function crm_private.crm_today_ar()
returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

create function crm_private.crm_local_date(p_at timestamptz)
returns date language sql stable set search_path = ''
as $$ select (p_at at time zone 'America/Argentina/Buenos_Aires')::date $$;

create function crm_private.crm_is_business_day(p_day date)
returns boolean language sql stable security definer set search_path = ''
as $$
  select extract(isodow from p_day) < 6
     and not exists (select 1 from public.crm_holidays h where h.day = p_day)
$$;

-- Cuenta desde el día siguiente: recibido el viernes, 1 día hábil es el lunes (si no es feriado).
create function crm_private.crm_add_business_days(p_from date, p_days integer)
returns date language plpgsql stable security definer set search_path = ''
as $$
declare
  v_day date := p_from;
  v_left integer := p_days;
begin
  if p_days is null or p_days < 0 or p_days > 366 then
    raise exception 'Cantidad de días inválida' using errcode = '22023';
  end if;
  while v_left > 0 loop
    v_day := v_day + 1;
    if crm_private.crm_is_business_day(v_day) then
      v_left := v_left - 1;
    end if;
  end loop;
  return v_day;
end;
$$;

-- El mismo día si es hábil; si no, el siguiente hábil. Lo usa la fase 4 para el arrepentimiento.
create function crm_private.crm_next_business_day(p_day date)
returns date language plpgsql stable security definer set search_path = ''
as $$
declare
  v_day date := p_day;
begin
  while not crm_private.crm_is_business_day(v_day) loop
    v_day := v_day + 1;
  end loop;
  return v_day;
end;
$$;

-- Años del rango que todavía no tienen feriados cargados: el plazo puede quedar corto.
create function crm_private.crm_missing_holiday_years(p_from date, p_to date)
returns integer[] language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(y order by y), '{}')
  from generate_series(extract(year from p_from)::integer, extract(year from greatest(p_from, p_to))::integer) as y
  where not exists (
    select 1 from public.crm_holidays h
    where h.day >= make_date(y, 1, 1) and h.day < make_date(y + 1, 1, 1)
  )
$$;

revoke execute on function crm_private.crm_today_ar(), crm_private.crm_local_date(timestamptz),
  crm_private.crm_is_business_day(date), crm_private.crm_add_business_days(date, integer),
  crm_private.crm_next_business_day(date), crm_private.crm_missing_holiday_years(date, date)
from public, anon;
grant execute on function crm_private.crm_today_ar(), crm_private.crm_local_date(timestamptz),
  crm_private.crm_is_business_day(date), crm_private.crm_add_business_days(date, integer),
  crm_private.crm_next_business_day(date), crm_private.crm_missing_holiday_years(date, date)
to authenticated;

-- ---------------------------------------------------------------------------
-- Pedidos de datos personales (acceso, rectificación, supresión)
-- ---------------------------------------------------------------------------
create table public.crm_data_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('acceso', 'rectificacion', 'supresion')),
  -- Si la persona se borra (por ejemplo, al cumplir una supresión), el pedido queda como constancia.
  person_id uuid references public.crm_people (id) on delete set null,
  requester_name text check (char_length(coalesce(requester_name, '')) <= 200),
  requester_email text check (char_length(coalesce(requester_email, '')) <= 320),
  channel text not null default 'email' check (channel in ('email', 'whatsapp', 'formulario', 'otro')),
  detail text check (char_length(coalesce(detail, '')) <= 5000),
  received_at timestamptz not null,
  due_date date not null,
  identity_verified boolean not null default false,
  status text not null default 'pendiente' check (status in ('pendiente', 'respondido', 'anulado')),
  resolved_at timestamptz,
  resolution_note text check (char_length(coalesce(resolution_note, '')) <= 5000),
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pendiente') = (resolved_at is null)),
  check (status <> 'anulado' or char_length(btrim(coalesce(resolution_note, ''))) > 0)
);

create index crm_data_requests_person_idx on public.crm_data_requests (person_id);
create index crm_data_requests_pending_idx on public.crm_data_requests (due_date) where status = 'pendiente';
create index crm_data_requests_created_by_idx on public.crm_data_requests (created_by);

alter table public.crm_data_requests enable row level security;
revoke all on public.crm_data_requests from anon, authenticated;

create trigger set_updated_at before update on public.crm_data_requests
  for each row execute function public.set_updated_at();

create function crm_private.crm_data_request_due(p_kind text, p_received_at timestamptz)
returns date language sql stable security definer set search_path = ''
as $$
  select case when p_kind = 'acceso'
    then crm_private.crm_local_date(p_received_at) + 10
    else crm_private.crm_add_business_days(crm_private.crm_local_date(p_received_at), 5) end
$$;

create function crm_private.crm_data_request_set_due()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.due_date := crm_private.crm_data_request_due(new.kind, new.received_at);
  return new;
end;
$$;

create trigger crm_data_request_due before insert or update of kind, received_at on public.crm_data_requests
  for each row execute function crm_private.crm_data_request_set_due();

-- Si la dueña carga o borra un feriado, los plazos pendientes se recalculan.
create function crm_private.crm_holidays_changed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.crm_data_requests r
  set due_date = crm_private.crm_data_request_due(r.kind, r.received_at)
  where r.status = 'pendiente' and r.kind <> 'acceso'
    and r.due_date is distinct from crm_private.crm_data_request_due(r.kind, r.received_at);
  return null;
end;
$$;

create trigger crm_holidays_changed after insert or update or delete on public.crm_holidays
  for each statement execute function crm_private.crm_holidays_changed();

revoke execute on function crm_private.crm_data_request_due(text, timestamptz),
  crm_private.crm_data_request_set_due(), crm_private.crm_holidays_changed()
from public, anon, authenticated;

create function crm_private.crm_new_code(p_prefix text)
returns text language sql volatile set search_path = ''
as $$
  -- Sin 0/O ni 1/I, igual que los códigos del sitio.
  select p_prefix || '-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::integer, 1), '')
  from generate_series(1, 6)
$$;
revoke execute on function crm_private.crm_new_code(text) from public, anon, authenticated;

create function public.crm_data_requests_list()
returns table (
  id uuid, code text, kind text, person_id uuid, person_name text,
  requester_name text, requester_email text, contact_hidden boolean,
  channel text, detail text, received_at timestamptz, due_date date, days_left integer,
  missing_holiday_years integer[], identity_verified boolean, status text,
  resolved_at timestamptz, resolved_on_time boolean, resolution_note text,
  previous_access_at timestamptz, created_by_email text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_contact boolean;
  v_today date := crm_private.crm_today_ar();
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('derechos.gestionar'));
  v_contact := crm_private.crm_has_permission('personas.ver_contacto');
  return query
  select r.id, r.code, r.kind, r.person_id,
         nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
         r.requester_name,
         case when v_contact then r.requester_email end,
         not v_contact,
         r.channel, r.detail, r.received_at, r.due_date,
         case when r.status = 'pendiente' then r.due_date - v_today end,
         case when r.status = 'pendiente' and r.kind <> 'acceso'
           then crm_private.crm_missing_holiday_years(crm_private.crm_local_date(r.received_at), r.due_date)
           else '{}'::integer[] end,
         r.identity_verified, r.status, r.resolved_at,
         case when r.status = 'respondido' then crm_private.crm_local_date(r.resolved_at) <= r.due_date end,
         r.resolution_note,
         -- Ley 25.326, art. 14 inc. 3: el acceso es gratuito cada seis meses como mínimo.
         case when r.kind = 'acceso' then (
           select max(o.received_at) from public.crm_data_requests o
           where o.id <> r.id and o.kind = 'acceso' and o.status = 'respondido'
             and o.received_at < r.received_at and o.received_at > r.received_at - interval '6 months'
             and ((r.person_id is not null and o.person_id = r.person_id)
               or (r.requester_email is not null and lower(o.requester_email) = lower(r.requester_email)))
         ) end,
         r.created_by_email
  from public.crm_data_requests r
  left join public.crm_people p on p.id = r.person_id
  order by (r.status = 'pendiente') desc, r.due_date, r.received_at desc;
end;
$$;

create function public.crm_data_request_create(
  p_kind text, p_received_at timestamptz, p_person_id uuid default null,
  p_requester_name text default null, p_requester_email text default null,
  p_channel text default 'email', p_detail text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_person public.crm_people;
  v_contact boolean;
  v_code text;
  v_name text;
  v_email text;
  v_row public.crm_data_requests;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('derechos.gestionar'));
  v_contact := crm_private.crm_has_permission('personas.ver_contacto');
  if p_received_at is null or p_received_at > now() + interval '5 minutes' then
    raise exception 'La fecha de recepción no puede ser futura' using errcode = '22023';
  end if;
  if p_received_at < now() - interval '1 year' then
    raise exception 'La fecha de recepción es de hace más de un año' using errcode = '22023';
  end if;
  if p_person_id is not null then
    select * into v_person from public.crm_people where id = p_person_id;
    if not found then
      raise exception 'La persona no existe' using errcode = 'P0002';
    end if;
  end if;
  v_name := coalesce(nullif(btrim(coalesce(p_requester_name, '')), ''),
                     nullif(btrim(concat_ws(' ', v_person.first_name, v_person.last_name)), ''));
  -- Sin permiso de contacto no se escribe un email: se toma el de la ficha.
  v_email := coalesce(case when v_contact then nullif(btrim(coalesce(p_requester_email, '')), '') end, v_person.email);
  if p_person_id is null and v_name is null and v_email is null then
    raise exception 'Indicá quién hizo el pedido' using errcode = '23514';
  end if;

  loop
    v_code := crm_private.crm_new_code('DAT');
    exit when not exists (select 1 from public.crm_data_requests where code = v_code);
  end loop;

  insert into public.crm_data_requests (
    code, kind, person_id, requester_name, requester_email, channel, detail, received_at, due_date,
    created_by, created_by_email
  )
  select v_code, p_kind, p_person_id, v_name, v_email, p_channel, nullif(btrim(coalesce(p_detail, '')), ''), p_received_at, current_date,
         auth.uid(), m.email
  from public.crm_members m where m.user_id = auth.uid()
  returning * into v_row;

  perform crm_private.crm_audit('crear_pedido_datos', 'crm_data_requests', v_row.id::text,
    jsonb_strip_nulls(jsonb_build_object('codigo', v_row.code, 'tipo', v_row.kind, 'persona', v_row.person_id)));
  return jsonb_build_object('id', v_row.id, 'code', v_row.code, 'due_date', v_row.due_date);
end;
$$;

create function public.crm_data_request_update(p_id uuid, p_identity_verified boolean, p_detail text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.crm_data_requests;
  v_changed text[] := '{}';
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('derechos.gestionar'));
  select * into v_old from public.crm_data_requests where id = p_id;
  if not found then
    raise exception 'El pedido no existe' using errcode = 'P0002';
  end if;
  if v_old.status <> 'pendiente' then
    raise exception 'El pedido ya está cerrado' using errcode = '23514';
  end if;
  if coalesce(p_identity_verified, false) is distinct from v_old.identity_verified then
    v_changed := array_append(v_changed, 'identidad');
  end if;
  if nullif(btrim(coalesce(p_detail, '')), '') is distinct from v_old.detail then
    v_changed := array_append(v_changed, 'detalle');
  end if;
  if cardinality(v_changed) = 0 then
    return;
  end if;
  update public.crm_data_requests set
    identity_verified = coalesce(p_identity_verified, false),
    detail = nullif(btrim(coalesce(p_detail, '')), '')
  where id = p_id;
  perform crm_private.crm_audit('editar_pedido_datos', 'crm_data_requests', p_id::text,
    jsonb_build_object('codigo', v_old.code, 'campos', to_jsonb(v_changed)));
end;
$$;

create function public.crm_data_request_close(p_id uuid, p_status text, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.crm_data_requests;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('derechos.gestionar'));
  if p_status not in ('respondido', 'anulado') then
    raise exception 'Estado inválido' using errcode = '23514';
  end if;
  select * into v_old from public.crm_data_requests where id = p_id;
  if not found then
    raise exception 'El pedido no existe' using errcode = 'P0002';
  end if;
  if v_old.status <> 'pendiente' then
    raise exception 'El pedido ya está cerrado' using errcode = '23514';
  end if;
  if p_status = 'anulado' and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Contá por qué se anula el pedido' using errcode = '23514';
  end if;
  update public.crm_data_requests set
    status = p_status, resolved_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id;
  perform crm_private.crm_audit('cerrar_pedido_datos', 'crm_data_requests', p_id::text,
    jsonb_build_object('codigo', v_old.code, 'tipo', v_old.kind, 'estado', p_status,
      'a_tiempo', crm_private.crm_today_ar() <= v_old.due_date));
end;
$$;

-- ---------------------------------------------------------------------------
-- Consentimientos: una constancia por cada vez que se da o se retira.
-- ---------------------------------------------------------------------------
create table public.crm_consents (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.crm_people (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  kind text not null check (kind in ('privacidad', 'mayor_de_edad', 'publicar_nombre')),
  granted boolean not null,
  source text not null check (char_length(source) between 1 and 60),
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_by_email text
);

create index crm_consents_person_idx on public.crm_consents (person_id, kind, recorded_at desc);
create index crm_consents_lead_idx on public.crm_consents (lead_id);
create index crm_consents_recorded_by_idx on public.crm_consents (recorded_by);

alter table public.crm_consents enable row level security;
revoke all on public.crm_consents from anon, authenticated;

-- Las constancias no se editan.
create function crm_private.crm_consents_immutable()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.lead_id is distinct from old.lead_id
     and (to_jsonb(new) - 'lead_id') = (to_jsonb(old) - 'lead_id') then
    return new; -- borrar el formulario deja la constancia sin enlace
  end if;
  raise exception 'Las constancias de consentimiento no se editan' using errcode = '42501';
end;
$$;

create trigger crm_consents_immutable before update on public.crm_consents
  for each row execute function crm_private.crm_consents_immutable();

-- Cada formulario deja constancia de las casillas que marcó la persona.
create function crm_private.crm_record_lead_consents()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_member_email text := (select m.email from public.crm_members m where m.user_id = auth.uid());
begin
  if new.person_id is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.crm_consents (person_id, lead_id, kind, granted, source, recorded_at)
    select new.person_id, new.id, c.kind, true, new.source, new.created_at
    from (values ('privacidad', new.privacy_consent), ('mayor_de_edad', new.adult_confirmed),
                 ('publicar_nombre', new.publish_consent)) as c(kind, given)
    where c.given;
  else
    insert into public.crm_consents (person_id, lead_id, kind, granted, source, recorded_by, recorded_by_email)
    select new.person_id, new.id, c.kind, c.now_given, 'equipo', auth.uid(), v_member_email
    from (values ('privacidad', old.privacy_consent, new.privacy_consent),
                 ('mayor_de_edad', old.adult_confirmed, new.adult_confirmed),
                 ('publicar_nombre', old.publish_consent, new.publish_consent)) as c(kind, was_given, now_given)
    where c.was_given is distinct from c.now_given;
  end if;
  return null;
end;
$$;

revoke execute on function crm_private.crm_consents_immutable(), crm_private.crm_record_lead_consents()
from public, anon, authenticated;

create trigger crm_record_consents after insert on public.leads
  for each row execute function crm_private.crm_record_lead_consents();
create trigger crm_record_consent_changes after update of privacy_consent, adult_confirmed, publish_consent on public.leads
  for each row execute function crm_private.crm_record_lead_consents();

-- Los formularios que ya existían.
insert into public.crm_consents (person_id, lead_id, kind, granted, source, recorded_at)
select l.person_id, l.id, c.kind, true, l.source, l.created_at
from public.leads l
cross join lateral (values ('privacidad', l.privacy_consent), ('mayor_de_edad', l.adult_confirmed),
                           ('publicar_nombre', l.publish_consent)) as c(kind, given)
where l.person_id is not null and c.given;

-- Retirar la autorización para publicar el nombre si gana una beca.
-- La privacidad no se retira acá: eso es un pedido de supresión.
create function public.crm_consent_withdraw(p_person_id uuid, p_kind text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('personas.editar'));
  if p_kind is distinct from 'publicar_nombre' then
    raise exception 'Solo se retira la autorización para publicar el nombre' using errcode = '23514';
  end if;
  if not exists (select 1 from public.crm_people where id = p_person_id) then
    raise exception 'La persona no existe' using errcode = 'P0002';
  end if;
  update public.leads set publish_consent = false where person_id = p_person_id and publish_consent;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'La persona no tiene esa autorización vigente' using errcode = '23514';
  end if;
  perform crm_private.crm_audit('retirar_consentimiento', 'crm_people', p_person_id::text,
    jsonb_build_object('tipo', p_kind, 'formularios', v_n));
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retención
-- ---------------------------------------------------------------------------
-- Cuándo vence cada formulario. Null: todavía no tiene fecha (lista de espera hasta el sorteo).
create function crm_private.crm_lead_expires_at(p_source text, p_created_at timestamptz, p_last_activity_at timestamptz)
returns timestamptz language sql immutable set search_path = ''
as $$
  select case
    when p_source = 'contacto' then greatest(p_created_at, coalesce(p_last_activity_at, p_created_at)) + interval '2 years'
    when p_source in ('arrepentimiento', 'baja') then p_created_at + interval '3 years'
  end
$$;
revoke execute on function crm_private.crm_lead_expires_at(text, timestamptz, timestamptz) from public, anon;
grant execute on function crm_private.crm_lead_expires_at(text, timestamptz, timestamptz) to authenticated;

create function public.crm_retention_list()
returns table (
  id uuid, person_id uuid, first_name text, last_name text, source text,
  request_code text, created_at timestamptz, expires_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('personas.borrar'));
  return query
  select l.id, l.person_id, coalesce(p.first_name, l.name), coalesce(p.last_name, l.last_name), l.source,
         l.request_code, l.created_at, x.expires_at
  from public.leads l
  left join public.crm_people p on p.id = l.person_id
  cross join lateral (select crm_private.crm_lead_expires_at(l.source, l.created_at, p.last_activity_at) as expires_at) x
  where x.expires_at <= now() and crm_private.crm_can_see_source(l.source)
  order by x.expires_at;
end;
$$;

create function public.crm_retention_purge(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_people uuid[];
  v_by_source jsonb;
  v_leads integer;
  v_removed_people integer;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('personas.borrar'));
  if p_ids is null or cardinality(p_ids) = 0 then
    return jsonb_build_object('mensajes', 0, 'personas', 0);
  end if;
  if cardinality(p_ids) > 1000 then
    raise exception 'Borrá de a 1000 como máximo' using errcode = '22023';
  end if;

  -- Se vuelve a revisar el vencimiento: si hubo actividad nueva, el formulario se queda.
  with target as (
    select l.id, l.person_id, l.source
    from public.leads l
    left join public.crm_people p on p.id = l.person_id
    where l.id = any (p_ids)
      and crm_private.crm_lead_expires_at(l.source, l.created_at, p.last_activity_at) <= now()
      and crm_private.crm_can_see_source(l.source)
  ), deleted as (
    delete from public.leads l using target t where l.id = t.id
    returning t.person_id, t.source
  )
  select coalesce(array_agg(distinct person_id) filter (where person_id is not null), '{}'),
         count(*)::integer,
         coalesce((select jsonb_object_agg(source, n) from (select source, count(*) as n from deleted group by source) s), '{}')
  into v_people, v_leads, v_by_source
  from deleted;

  -- Quien se queda sin formularios deja de tener motivo para estar en la base.
  delete from public.crm_people p
  where p.id = any (v_people) and not exists (select 1 from public.leads l where l.person_id = p.id);
  get diagnostics v_removed_people = row_count;

  if v_leads > 0 then
    perform crm_private.crm_audit('borrar_vencidos', 'leads', null,
      jsonb_build_object('mensajes', v_leads, 'personas', v_removed_people, 'por_tipo', v_by_source));
  end if;
  return jsonb_build_object('mensajes', v_leads, 'personas', v_removed_people);
end;
$$;

-- ---------------------------------------------------------------------------
-- Hoy: lo que vence y lo que falta, según los permisos de quien entra.
-- ---------------------------------------------------------------------------
create function public.crm_today()
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
        'created_at', l.created_at, 'deadline', l.created_at + interval '24 hours'
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
      -- Los plazos de los próximos 15 días necesitan los feriados de ese año.
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

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- La ficha suma consentimientos y pedidos de datos.
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
    ), '[]'::jsonb) end
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

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on function
  public.crm_data_requests_list(),
  public.crm_data_request_create(text, timestamptz, uuid, text, text, text, text),
  public.crm_data_request_update(uuid, boolean, text),
  public.crm_data_request_close(uuid, text, text),
  public.crm_consent_withdraw(uuid, text),
  public.crm_retention_list(), public.crm_retention_purge(uuid[]),
  public.crm_today()
from public, anon;
grant execute on function
  public.crm_data_requests_list(),
  public.crm_data_request_create(text, timestamptz, uuid, text, text, text, text),
  public.crm_data_request_update(uuid, boolean, text),
  public.crm_data_request_close(uuid, text, text),
  public.crm_consent_withdraw(uuid, text),
  public.crm_retention_list(), public.crm_retention_purge(uuid[]),
  public.crm_today()
to authenticated;
