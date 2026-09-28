-- Prueba del aviso de la fecha del sorteo a la lista de espera.
-- Correla en el SQL Editor de Supabase. Termina con un error a propósito para revertir todo:
-- leé el mensaje, tiene que decir "FALLAS: 0". No manda emails: solo los deja en cola.

do $$
declare
  v_a uuid := gen_random_uuid();   -- sin permiso de sorteo
  v_f uuid := gen_random_uuid();   -- sorteo
  v_role_a uuid;
  v_role_f uuid;
  v_date date := crm_private.crm_today_ar() + 10;
  v_n int;
  v_j jsonb;
  v_txt text;
  v_ok boolean;
  r text := '';
  fallas int := 0;
begin
  insert into auth.users (id, email, aud, role) values
    (v_a, 'prueba-a@example.com', 'authenticated', 'authenticated'),
    (v_f, 'prueba-f@example.com', 'authenticated', 'authenticated');
  insert into public.crm_roles (name) values ('Prueba A') returning id into v_role_a;
  insert into public.crm_roles (name) values ('Prueba F') returning id into v_role_f;
  insert into public.crm_role_permissions values (v_role_a, 'mensajes.ver'), (v_role_f, 'sorteo.gestionar');
  insert into public.crm_members (user_id, email, role_id) values
    (v_a, 'prueba-a@example.com', v_role_a), (v_f, 'prueba-f@example.com', v_role_f);
  update public.crm_enrollment_settings set opened_at = null, enrollments_open = false where id = 1;

  -- Lista de espera: dos personas (una anotada dos veces), una sin declarar la edad y un contacto común.
  insert into public.leads (source, name, last_name, email, privacy_consent, adult_confirmed, created_at) values
    ('suscripcion', 'Uno', 'Aviso', 'uno.aviso@example.com', true, true, now() - interval '3 days'),
    ('suscripcion', 'Uno', 'Aviso', 'uno.aviso@example.com', true, true, now() - interval '2 days'),
    ('suscripcion', 'Dos', 'Aviso', 'dos.aviso@example.com', true, true, now() - interval '2 days'),
    ('suscripcion', 'Menor', 'Aviso', 'menor.aviso@example.com', true, false, now() - interval '2 days'),
    ('contacto', 'Contacto', 'Aviso', 'contacto.aviso@example.com', true, true, now() - interval '2 days');

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_raffle_announce(v_date);
    r := r || 'A.no_avisa=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.no_avisa=ok ';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_f, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_raffle_announce(crm_private.crm_today_ar() + 6);
    r := r || 'siete_dias_de_anticipacion=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'siete_dias_de_anticipacion=ok ';
  end;
  perform public.crm_raffle_announce(v_date);
  begin
    perform public.crm_raffle_announce(v_date);
    r := r || 'misma_fecha_dos_veces=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'misma_fecha_dos_veces=ok ';
  end;
  v_j := public.crm_raffle_view();
  execute 'reset role';

  select count(*) filter (where e.to_email = 'uno.aviso@example.com') = 1
     and count(*) filter (where e.to_email = 'dos.aviso@example.com') = 1
     and count(*) filter (where e.to_email in ('menor.aviso@example.com', 'contacto.aviso@example.com')) = 0
  into v_ok
  from public.crm_emails e where e.template_key = 'aviso_fecha_sorteo' and e.to_email like '%.aviso@example.com';
  if v_ok then r := r || 'una_vez_por_persona_mayor=ok '; else r := r || 'una_vez_por_persona_mayor=MAL '; fallas := fallas + 1; end if;

  select body into v_txt from public.crm_emails where template_key = 'aviso_fecha_sorteo' and to_email = 'uno.aviso@example.com';
  if v_txt like '%Hola Uno:%' and v_txt like '%' || crm_private.crm_long_date(v_date) || '%' and v_txt like '%/terminos%'
     and crm_private.crm_long_date('2026-10-12') = 'lunes 12 de octubre de 2026'
  then r := r || 'texto_con_fecha_y_bases=ok '; else r := r || 'texto_con_fecha_y_bases=MAL '; fallas := fallas + 1; end if;

  if (v_j->'announcement'->>'raffle_date')::date = v_date and (v_j->'announcement'->>'recipients')::int >= 2
  then r := r || 'vista_muestra_el_aviso=ok '; else r := r || 'vista_muestra_el_aviso=MAL '; fallas := fallas + 1; end if;

  -- Quien se anota después del aviso y antes de la apertura también recibe la fecha, desde el sitio.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  insert into public.leads (source, name, email, privacy_consent, adult_confirmed)
  values ('suscripcion', 'Tres', 'tres.aviso@example.com', true, true);
  execute 'reset role';
  select count(*) into v_n from public.crm_emails where template_key = 'aviso_fecha_sorteo' and to_email = 'tres.aviso@example.com';
  if v_n = 1 then r := r || 'llega_a_quien_se_anota_despues=ok '; else r := r || 'llega_a_quien_se_anota_despues=MAL '; fallas := fallas + 1; end if;

  -- Después de la apertura, las inscripciones nuevas no participan: no reciben el aviso.
  update public.crm_enrollment_settings set opened_at = now(), enrollments_open = true where id = 1;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  insert into public.leads (source, name, email, privacy_consent, adult_confirmed)
  values ('suscripcion', 'Cuatro', 'cuatro.aviso@example.com', true, true);
  execute 'reset role';
  select count(*) into v_n from public.crm_emails where template_key = 'aviso_fecha_sorteo' and to_email = 'cuatro.aviso@example.com';
  if v_n = 0 then r := r || 'despues_de_abrir_no=ok '; else r := r || 'despues_de_abrir_no=MAL '; fallas := fallas + 1; end if;

  select count(*) into v_n from public.crm_audit_log
  where action = 'anunciar_sorteo' and actor_id = v_f and detail->>'fecha' = v_date::text and not detail::text ilike '%aviso@%';
  if v_n = 1 then r := r || 'auditado_sin_datos=ok '; else r := r || 'auditado_sin_datos=MAL '; fallas := fallas + 1; end if;

  raise exception 'FALLAS: % | %', fallas, r;
end;
$$;
