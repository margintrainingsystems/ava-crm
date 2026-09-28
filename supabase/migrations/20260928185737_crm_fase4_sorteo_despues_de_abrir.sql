-- El sorteo se prepara solo después de la primera apertura de inscripciones.
create or replace function public.crm_raffle_prepare(p_scheduled_for date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_cutoff timestamptz := (select s.opened_at from public.crm_enrollment_settings s where s.id = 1);
  v_count integer;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('sorteo.gestionar'));
  -- Las Bases cuentan a quienes se anotaron antes de la apertura: sin apertura no hay corte.
  if v_cutoff is null then
    raise exception 'Primero abrí las inscripciones: la lista se numera con quienes se anotaron antes de la apertura' using errcode = '23514';
  end if;
  if exists (select 1 from public.crm_raffles where status <> 'cerrado') then
    raise exception 'Ya hay un sorteo abierto' using errcode = '23514';
  end if;
  insert into public.crm_raffles (scheduled_for, created_by_email)
  select p_scheduled_for, m.email from public.crm_members m where m.user_id = auth.uid()
  returning id into v_id;

  insert into public.crm_raffle_entries (raffle_id, number, person_id, lead_id, signed_up_at)
  select v_id, row_number() over (order by f.created_at, f.id), f.person_id, f.id, f.created_at
  from (
    select distinct on (l.person_id) l.id, l.person_id, l.created_at
    from public.leads l
    where l.source = 'suscripcion' and l.person_id is not null and l.adult_confirmed and l.created_at < v_cutoff
    order by l.person_id, l.created_at, l.id
  ) f;
  get diagnostics v_count = row_count;

  update public.crm_raffles r set
    entries_count = v_count,
    entries_digest = (
      select encode(extensions.digest(coalesce(string_agg(e.number::text || ':' || e.lead_id::text, ',' order by e.number), ''), 'sha256'), 'hex')
      from public.crm_raffle_entries e where e.raffle_id = v_id
    )
  where r.id = v_id;
  perform crm_private.crm_audit('preparar_sorteo', 'crm_raffles', v_id::text, jsonb_build_object('participantes', v_count));
  return v_id;
end;
$$;
