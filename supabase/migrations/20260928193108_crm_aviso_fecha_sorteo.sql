-- Aviso de la fecha del sorteo a toda la lista de espera, como piden las Bases:
-- "La fecha exacta se avisa por email a todas las personas anotadas con al menos 7 días de anticipación".

create table public.crm_raffle_announcements (
  id uuid primary key default gen_random_uuid(),
  raffle_date date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);
create index crm_raffle_announcements_created_by_idx on public.crm_raffle_announcements (created_by);

-- A quién se le mandó cada aviso: nadie recibe dos veces el mismo.
create table public.crm_raffle_announcement_sends (
  announcement_id uuid not null references public.crm_raffle_announcements (id) on delete cascade,
  person_id uuid not null references public.crm_people (id) on delete cascade,
  email_id uuid references public.crm_emails (id) on delete set null,
  primary key (announcement_id, person_id)
);
create index crm_raffle_announcement_sends_person_idx on public.crm_raffle_announcement_sends (person_id);
create index crm_raffle_announcement_sends_email_idx on public.crm_raffle_announcement_sends (email_id);

alter table public.crm_raffle_announcements enable row level security;
alter table public.crm_raffle_announcement_sends enable row level security;
revoke all on public.crm_raffle_announcements, public.crm_raffle_announcement_sends from anon, authenticated;

insert into public.crm_email_templates (key, name, description, placeholders, subject, body) values (
  'aviso_fecha_sorteo',
  'Aviso de la fecha del sorteo',
  'Sale a toda la lista de espera cuando avisás la fecha desde Sorteo, y a quien se anote después, hasta la apertura.',
  array['nombre', 'fecha', 'enlace_bases'],
  'AVA: el sorteo de las becas es el {fecha}',
  E'Hola {nombre}:\n\nComo estás en la lista de espera de AVA, participás del sorteo de 3 becas del 50% sobre el precio de lanzamiento del primer año de suscripción.\n\nEl sorteo es el {fecha}. Numeramos la lista de espera por orden de inscripción y elegimos los números al azar. La pantalla del sorteo se graba y la grabación se publica en las redes de AVA, sin datos personales.\n\nSi ganás, te escribimos a este mismo email.\n\nParticipar es gratis y no requiere comprar nada. Las bases completas están en {enlace_bases}\n\nAVA'
);

-- Fecha larga en castellano: "lunes 12 de octubre de 2026".
create function crm_private.crm_long_date(p_day date)
returns text language sql immutable set search_path = ''
as $$
  select (array['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'])[extract(dow from p_day)::integer + 1]
         || ' ' || extract(day from p_day)::integer
         || ' de ' || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
                             'octubre', 'noviembre', 'diciembre'])[extract(month from p_day)::integer]
         || ' de ' || extract(year from p_day)::integer
$$;
revoke execute on function crm_private.crm_long_date(date) from public, anon, authenticated;

-- Deja en cola el aviso para una persona. Devuelve false si ya lo tenía o no tiene un email válido.
create function crm_private.crm_queue_raffle_announcement(p_announcement uuid, p_person uuid, p_by uuid, p_by_email text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_ann public.crm_raffle_announcements;
  v_person public.crm_people;
  v_template public.crm_email_templates;
  v_values jsonb;
  v_email uuid;
begin
  select * into v_ann from public.crm_raffle_announcements where id = p_announcement;
  select * into v_person from public.crm_people where id = p_person;
  if not found or not crm_private.crm_email_looks_valid(v_person.email)
     or exists (select 1 from public.crm_raffle_announcement_sends s where s.announcement_id = p_announcement and s.person_id = p_person) then
    return false;
  end if;
  select * into v_template from public.crm_email_templates where key = 'aviso_fecha_sorteo';
  v_values := jsonb_build_object(
    'nombre', coalesce(v_person.first_name, ''),
    'fecha', crm_private.crm_long_date(v_ann.raffle_date),
    'enlace_bases', (select e.site_url from public.crm_enrollment_settings e where e.id = 1) || '/terminos'
  );
  insert into public.crm_emails (kind, template_key, person_id, to_email, subject, body, created_by, created_by_email)
  values ('aviso', v_template.key, v_person.id, btrim(v_person.email),
          crm_private.crm_render(v_template.subject, v_values), crm_private.crm_render(v_template.body, v_values),
          p_by, p_by_email)
  returning id into v_email;
  insert into public.crm_raffle_announcement_sends (announcement_id, person_id, email_id) values (p_announcement, p_person, v_email);
  return true;
end;
$$;
revoke execute on function crm_private.crm_queue_raffle_announcement(uuid, uuid, uuid, text) from public, anon, authenticated;

-- Avisa la fecha a toda la lista de espera: mayores de 18, una vez por persona.
create function public.crm_raffle_announce(p_date date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_email text := (select m.email from public.crm_members m where m.user_id = auth.uid());
  v_count integer := 0;
  v_person uuid;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('sorteo.gestionar'));
  if p_date is null or p_date < crm_private.crm_today_ar() + 7 then
    raise exception 'Las Bases piden avisar con al menos 7 días de anticipación: elegí el % o una fecha posterior',
      to_char(crm_private.crm_today_ar() + 7, 'DD/MM/YYYY') using errcode = '23514';
  end if;
  if exists (select 1 from public.crm_raffles r where r.status = 'sorteado') then
    raise exception 'El sorteo ya se hizo: cerralo antes de avisar una fecha nueva' using errcode = '23514';
  end if;
  if (select n.raffle_date from public.crm_raffle_announcements n order by n.created_at desc limit 1) = p_date then
    raise exception 'Ya avisaste esa fecha' using errcode = '23514';
  end if;
  insert into public.crm_raffle_announcements (raffle_date, created_by, created_by_email)
  values (p_date, auth.uid(), v_email) returning id into v_id;
  for v_person in
    select distinct l.person_id from public.leads l
    where l.source = 'suscripcion' and l.person_id is not null and l.adult_confirmed
  loop
    if crm_private.crm_queue_raffle_announcement(v_id, v_person, auth.uid(), v_email) then
      v_count := v_count + 1;
    end if;
  end loop;
  perform crm_private.crm_audit('anunciar_sorteo', 'crm_raffles', v_id::text,
    jsonb_build_object('fecha', p_date, 'destinatarios', v_count));
  return v_count;
end;
$$;

-- Quien se anota después del aviso y antes de la apertura también participa: le llega la fecha.
-- Nunca frena el formulario del sitio.
create function crm_private.crm_announce_to_new_signup()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_ann uuid;
begin
  if new.source <> 'suscripcion' or not coalesce(new.adult_confirmed, false) or new.person_id is null then
    return null;
  end if;
  begin
    if (select e.opened_at from public.crm_enrollment_settings e where e.id = 1) is not null then
      return null;
    end if;
    select n.id into v_ann from public.crm_raffle_announcements n
    where n.raffle_date >= crm_private.crm_today_ar()
    order by n.created_at desc limit 1;
    if v_ann is not null then
      perform crm_private.crm_queue_raffle_announcement(v_ann, new.person_id, null, null);
    end if;
  exception when others then
    raise warning 'No se pudo encolar el aviso del sorteo para %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function crm_private.crm_announce_to_new_signup() from public, anon, authenticated;

create trigger crm_announce_raffle after insert on public.leads
  for each row execute function crm_private.crm_announce_to_new_signup();

create or replace function public.crm_raffle_view()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_people boolean;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('sorteo.gestionar'));
  v_people := crm_private.crm_has_permission('personas.ver');
  return jsonb_build_object(
    'enrollments_open', (select s.enrollments_open from public.crm_enrollment_settings s where s.id = 1),
    'opened_at', (select s.opened_at from public.crm_enrollment_settings s where s.id = 1),
    'waitlist_count', (
      select count(distinct l.person_id) from public.leads l
      where l.source = 'suscripcion' and l.person_id is not null and l.adult_confirmed
    ),
    'announcement', (
      select jsonb_build_object(
        'raffle_date', n.raffle_date, 'created_at', n.created_at, 'created_by_email', n.created_by_email,
        'recipients', (select count(*) from public.crm_raffle_announcement_sends x where x.announcement_id = n.id),
        'sent', (select count(*) from public.crm_raffle_announcement_sends x join public.crm_emails e on e.id = x.email_id
                 where x.announcement_id = n.id and e.status = 'enviado'))
      from public.crm_raffle_announcements n order by n.created_at desc limit 1
    ),
    'raffles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'scheduled_for', r.scheduled_for, 'winners', r.winners,
        'substitutes', r.substitutes, 'discount_percent', r.discount_percent, 'entries_count', r.entries_count,
        'entries_digest', r.entries_digest, 'created_at', r.created_at, 'created_by_email', r.created_by_email,
        'drawn_at', r.drawn_at, 'drawn_by_email', r.drawn_by_email, 'closed_at', r.closed_at,
        'draws', coalesce((select jsonb_agg(jsonb_build_object('attempt', d.attempt, 'number', d.number, 'repeated', d.repeated) order by d.attempt)
                           from public.crm_raffle_draws d where d.raffle_id = r.id), '[]'::jsonb),
        'picks', coalesce((select jsonb_agg(jsonb_build_object(
            'id', k.id, 'position', k.position, 'role', k.role, 'number', k.entry_number, 'status', k.status,
            'person_id', case when v_people then k.person_id end,
            'name', case when v_people then nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') end,
            -- Nombre e inicial del apellido, solo si autorizó publicarlo y no lo retiró.
            'public_name', case when (
                select c.granted from public.crm_consents c
                where c.person_id = k.person_id and c.kind = 'publicar_nombre' order by c.recorded_at desc, c.id desc limit 1
              ) then nullif(btrim(concat_ws(' ', p.first_name, left(p.last_name, 1) || '.')), '') end,
            'notified_at', k.notified_at, 'respond_by', k.respond_by, 'beca_until', k.beca_until,
            'resolved_at', k.resolved_at, 'subscription_id', k.subscription_id
          ) order by k.position)
          from public.crm_raffle_picks k left join public.crm_people p on p.id = k.person_id
          where k.raffle_id = r.id), '[]'::jsonb)
      ) order by r.created_at desc)
      from public.crm_raffles r
    ), '[]'::jsonb)
  );
end;
$$;
