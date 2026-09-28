-- Prueba de la fase 2: feriados, días hábiles, pedidos de datos, consentimientos, retención y Hoy.
-- Correla en el SQL Editor de Supabase. Termina con un error a propósito para revertir todo:
-- leé el mensaje, tiene que decir "FALLAS: 0".

do $$
declare
  v_owner uuid := (select user_id from public.crm_members where is_owner);
  v_a uuid := gen_random_uuid();   -- docente: mensajes y personas, sin derechos ni borrar
  v_b uuid := gen_random_uuid();   -- atención: personas, pedidos, derechos y borrar
  v_c uuid := gen_random_uuid();   -- solo derechos, sin ver contacto
  v_s uuid := gen_random_uuid();   -- estudiante: sin acceso al CRM
  v_role_a uuid;
  v_role_b uuid;
  v_role_c uuid;
  v_person uuid;
  v_old_person uuid;
  v_old_lead uuid;
  v_fresh_lead uuid;
  v_req uuid;
  v_req2 uuid;
  v_due date;
  v_next date;
  v_n int;
  v_j jsonb;
  v_ok boolean;
  r text := '';
  fallas int := 0;
begin
  insert into auth.users (id, email, aud, role) values
    (v_a, 'prueba-a@example.com', 'authenticated', 'authenticated'),
    (v_b, 'prueba-b@example.com', 'authenticated', 'authenticated'),
    (v_c, 'prueba-c@example.com', 'authenticated', 'authenticated'),
    (v_s, 'prueba-s@example.com', 'authenticated', 'authenticated');
  insert into public.crm_roles (name) values ('Prueba A') returning id into v_role_a;
  insert into public.crm_roles (name) values ('Prueba B') returning id into v_role_b;
  insert into public.crm_roles (name) values ('Prueba C') returning id into v_role_c;
  insert into public.crm_role_permissions values
    (v_role_a, 'mensajes.ver'), (v_role_a, 'mensajes.responder'), (v_role_a, 'personas.ver'),
    (v_role_b, 'mensajes.ver'), (v_role_b, 'pedidos.gestionar'), (v_role_b, 'personas.ver'),
    (v_role_b, 'personas.ver_contacto'), (v_role_b, 'personas.editar'), (v_role_b, 'personas.borrar'),
    (v_role_b, 'derechos.gestionar'),
    (v_role_c, 'derechos.gestionar');
  insert into public.crm_members (user_id, email, role_id) values
    (v_a, 'prueba-a@example.com', v_role_a), (v_b, 'prueba-b@example.com', v_role_b),
    (v_c, 'prueba-c@example.com', v_role_c);

  -- 1. Días hábiles con un feriado de prueba (año 2040, lejos de los reales).
  --    Viernes 2/3/2040 + 5 hábiles = viernes 9/3. Con feriado el martes 6/3 = lunes 12/3.
  if crm_private.crm_add_business_days('2040-03-02', 5) = '2040-03-09' then r := r || 'habiles_sin_feriado=ok '; else r := r || 'habiles_sin_feriado=MAL '; fallas := fallas + 1; end if;
  if crm_private.crm_missing_holiday_years('2040-03-02', '2041-01-05') = array[2040, 2041] then r := r || 'anios_sin_feriados=ok '; else r := r || 'anios_sin_feriados=MAL '; fallas := fallas + 1; end if;

  -- 2. Solo la dueña carga feriados; el equipo los lee.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.crm_holidays (day, name) values ('2040-03-06', 'Prueba');
    r := r || 'A.no_carga_feriados=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.no_carga_feriados=ok ';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.crm_holidays (day, name) values ('2040-03-06', 'Feriado de prueba'), ('2041-01-01', 'Año Nuevo de prueba');
  execute 'reset role';

  if crm_private.crm_add_business_days('2040-03-02', 5) = '2040-03-12' then r := r || 'habiles_con_feriado=ok '; else r := r || 'habiles_con_feriado=MAL '; fallas := fallas + 1; end if;
  if crm_private.crm_next_business_day('2040-03-03') = '2040-03-05' and crm_private.crm_next_business_day('2040-03-05') = '2040-03-05' then r := r || 'siguiente_habil=ok '; else r := r || 'siguiente_habil=MAL '; fallas := fallas + 1; end if;
  if crm_private.crm_missing_holiday_years('2040-03-02', '2040-12-31') = '{}'::int[] then r := r || 'anio_con_feriados=ok '; else r := r || 'anio_con_feriados=MAL '; fallas := fallas + 1; end if;
  -- La lista oficial trae el 1 de enero del año siguiente: eso solo no completa el año.
  if crm_private.crm_missing_holiday_years('2040-03-02', '2041-06-01') = array[2041] then r := r || 'solo_1_de_enero_no_alcanza=ok '; else r := r || 'solo_1_de_enero_no_alcanza=MAL '; fallas := fallas + 1; end if;
  select count(*) into v_n from public.crm_audit_log where entity = 'crm_holidays' and action = 'insert' and actor_id = v_owner and detail->'despues'->>'day' = '2040-03-06';
  if v_n = 1 then r := r || 'feriado_auditado=ok '; else r := r || 'feriado_auditado=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.crm_holidays where day = '2040-03-06';
  execute 'reset role';
  if v_n = 1 then r := r || 'A.lee_feriados=ok '; else r := r || 'A.lee_feriados=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.crm_holidays;
  execute 'reset role';
  if v_n = 0 then r := r || 'S.no_lee_feriados=ok '; else r := r || 'S.no_lee_feriados=MAL '; fallas := fallas + 1; end if;

  -- 3. El sitio (anónimo) manda un formulario con las tres casillas: quedan tres constancias.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  insert into public.leads (source, name, last_name, email, country, privacy_consent, adult_confirmed, publish_consent)
  values ('suscripcion', 'Lucía', 'Gómez', 'lucia.fase2@example.com', 'Argentina', true, true, true);
  execute 'reset role';
  select id into v_person from public.crm_people where email_normalized = 'lucia.fase2@example.com';
  select count(*) into v_n from public.crm_consents where person_id = v_person and granted;
  if v_n = 3 then r := r || 'constancias_del_formulario=ok '; else r := r || 'constancias_del_formulario=MAL '; fallas := fallas + 1; end if;

  -- 4. Pedidos de datos.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_data_requests_list();
    r := r || 'A.no_ve_pedidos_datos=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.no_ve_pedidos_datos=ok ';
  end;
  begin
    perform public.crm_data_request_create('acceso', now(), v_person);
    r := r || 'A.no_crea_pedido=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.no_crea_pedido=ok ';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_j := public.crm_data_request_create('acceso', now(), v_person, null, null, 'email', 'Pide copia de sus datos');
  v_req := (v_j->>'id')::uuid;
  v_j := public.crm_data_request_create('supresion', now(), v_person);
  v_req2 := (v_j->>'id')::uuid;
  begin
    perform public.crm_data_request_create('acceso', now() + interval '2 days', v_person);
    r := r || 'B.no_acepta_fecha_futura=MAL '; fallas := fallas + 1;
  exception when invalid_parameter_value then r := r || 'B.no_acepta_fecha_futura=ok ';
  end;
  begin
    perform public.crm_data_request_create('acceso', now(), null, '  ', '');
    r := r || 'B.pide_quien=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'B.pide_quien=ok ';
  end;
  execute 'reset role';

  select due_date = crm_private.crm_today_ar() + 10 and code ~ '^DAT-[A-HJ-NP-Z2-9]{6}$'
         and requester_name = 'Lucía Gómez' and requester_email = 'lucia.fase2@example.com'
  into v_ok from public.crm_data_requests where id = v_req;
  if v_ok then r := r || 'acceso_10_corridos=ok '; else r := r || 'acceso_10_corridos=MAL '; fallas := fallas + 1; end if;
  select due_date = crm_private.crm_add_business_days(crm_private.crm_today_ar(), 5) into v_ok from public.crm_data_requests where id = v_req2;
  if v_ok then r := r || 'supresion_5_habiles=ok '; else r := r || 'supresion_5_habiles=MAL '; fallas := fallas + 1; end if;

  -- Un feriado nuevo dentro del plazo corre el vencimiento de lo pendiente.
  select due_date into v_due from public.crm_data_requests where id = v_req2;
  v_next := crm_private.crm_add_business_days(crm_private.crm_today_ar(), 1);
  insert into public.crm_holidays (day, name) values (v_next, 'Feriado de prueba 2') on conflict (day) do nothing;
  select due_date > v_due and due_date = crm_private.crm_add_business_days(crm_private.crm_today_ar(), 5)
  into v_ok from public.crm_data_requests where id = v_req2;
  if v_ok then r := r || 'feriado_recalcula=ok '; else r := r || 'feriado_recalcula=MAL '; fallas := fallas + 1; end if;

  -- C gestiona derechos sin ver contacto: el email queda oculto.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.crm_data_requests_list() x
  where x.person_id = v_person and x.requester_email is null and x.contact_hidden;
  execute 'reset role';
  if v_n = 2 then r := r || 'C.email_oculto=ok '; else r := r || 'C.email_oculto=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.crm_data_request_update(v_req, true, 'Pide copia de sus datos. Identidad confirmada por email.');
  begin
    perform public.crm_data_request_close(v_req2, 'anulado', '   ');
    r := r || 'anular_pide_motivo=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'anular_pide_motivo=ok ';
  end;
  perform public.crm_data_request_close(v_req, 'respondido', 'Enviamos el archivo con sus datos.');
  begin
    perform public.crm_data_request_close(v_req, 'respondido', null);
    r := r || 'no_cierra_dos_veces=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'no_cierra_dos_veces=ok ';
  end;
  select resolved_on_time into v_ok from public.crm_data_requests_list() where id = v_req;
  execute 'reset role';
  if v_ok then r := r || 'respondido_a_tiempo=ok '; else r := r || 'respondido_a_tiempo=MAL '; fallas := fallas + 1; end if;
  select identity_verified and status = 'respondido' and resolved_at is not null into v_ok from public.crm_data_requests where id = v_req;
  if v_ok then r := r || 'pedido_cerrado=ok '; else r := r || 'pedido_cerrado=MAL '; fallas := fallas + 1; end if;
  select count(*) into v_n from public.crm_audit_log
  where entity = 'crm_data_requests' and entity_id in (v_req::text, v_req2::text)
    and action in ('crear_pedido_datos', 'editar_pedido_datos', 'cerrar_pedido_datos');
  if v_n = 4 then r := r || 'pedidos_auditados=ok '; else r := r || 'pedidos_auditados=MAL(' || v_n || ') '; fallas := fallas + 1; end if;
  select count(*) into v_n from public.crm_audit_log
  where entity = 'crm_data_requests' and entity_id in (v_req::text, v_req2::text) and detail::text ilike '%lucia%';
  if v_n = 0 then r := r || 'auditoria_sin_datos=ok '; else r := r || 'auditoria_sin_datos=MAL '; fallas := fallas + 1; end if;

  -- 5. Consentimientos: retirar la autorización para publicar el nombre.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_consent_withdraw(v_person, 'publicar_nombre');
    r := r || 'A.no_retira=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.no_retira=ok ';
  end;
  v_j := public.crm_person_detail(v_person);
  execute 'reset role';
  if jsonb_array_length(v_j->'consents') = 3 and v_j->'data_requests' = 'null'::jsonb then r := r || 'A.ficha_sin_pedidos_datos=ok '; else r := r || 'A.ficha_sin_pedidos_datos=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_consent_withdraw(v_person, 'privacidad');
    r := r || 'privacidad_no_se_retira_aca=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'privacidad_no_se_retira_aca=ok ';
  end;
  v_n := public.crm_consent_withdraw(v_person, 'publicar_nombre');
  begin
    perform public.crm_consent_withdraw(v_person, 'publicar_nombre');
    r := r || 'no_retira_dos_veces=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'no_retira_dos_veces=ok ';
  end;
  v_j := public.crm_person_detail(v_person);
  execute 'reset role';
  select not publish_consent into v_ok from public.leads where person_id = v_person;
  if v_n = 1 and v_ok then r := r || 'retiro_actualiza_formulario=ok '; else r := r || 'retiro_actualiza_formulario=MAL '; fallas := fallas + 1; end if;
  select count(*) into v_n from public.crm_consents
  where person_id = v_person and kind = 'publicar_nombre' and not granted and recorded_by = v_b and source = 'equipo';
  if v_n = 1 then r := r || 'retiro_con_constancia=ok '; else r := r || 'retiro_con_constancia=MAL '; fallas := fallas + 1; end if;
  if jsonb_array_length(v_j->'consents') = 4 and jsonb_array_length(v_j->'data_requests') = 2 then r := r || 'B.ficha_completa=ok '; else r := r || 'B.ficha_completa=MAL '; fallas := fallas + 1; end if;
  begin
    update public.crm_consents set granted = true where person_id = v_person and not granted;
    r := r || 'constancia_inmutable=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'constancia_inmutable=ok ';
  end;

  -- 6. Retención: un contacto de hace 3 años vence; uno nuevo no.
  insert into public.leads (source, name, email, message, privacy_consent, created_at)
  values ('contacto', 'Viejo', 'viejo.fase2@example.com', 'Hola', true, now() - interval '3 years')
  returning id, person_id into v_old_lead, v_old_person;
  insert into public.leads (source, name, email, message, privacy_consent)
  values ('contacto', 'Nuevo', 'nuevo.fase2@example.com', 'Hola', true)
  returning id into v_fresh_lead;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_retention_list();
    r := r || 'A.no_ve_retencion=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.no_ve_retencion=ok ';
  end;
  v_j := public.crm_today();
  execute 'reset role';
  if v_j ? 'unread' and not v_j ? 'requests' and not v_j ? 'data_requests' and not v_j ? 'expired_count' then r := r || 'A.hoy_segun_permisos=ok '; else r := r || 'A.hoy_segun_permisos=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) filter (where x.id = v_old_lead) - count(*) filter (where x.id = v_fresh_lead)
  into v_n from public.crm_retention_list() x;
  v_j := public.crm_today();
  execute 'reset role';
  if v_n = 1 then r := r || 'vencido_en_lista=ok '; else r := r || 'vencido_en_lista=MAL '; fallas := fallas + 1; end if;
  if v_j ? 'requests' and v_j ? 'data_requests' and (v_j->>'expired_count')::int >= 1
     and jsonb_array_length(v_j->'data_requests') >= 1 then r := r || 'B.hoy_completo=ok '; else r := r || 'B.hoy_completo=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_j := public.crm_retention_purge(array[v_old_lead, v_fresh_lead]);
  execute 'reset role';
  if (v_j->>'mensajes')::int = 1 and (v_j->>'personas')::int = 1 then r := r || 'borra_solo_vencido=ok '; else r := r || 'borra_solo_vencido=MAL '; fallas := fallas + 1; end if;
  select not exists (select 1 from public.leads where id = v_old_lead)
     and not exists (select 1 from public.crm_people where id = v_old_person)
     and exists (select 1 from public.leads where id = v_fresh_lead)
  into v_ok;
  if v_ok then r := r || 'persona_vencida_borrada=ok '; else r := r || 'persona_vencida_borrada=MAL '; fallas := fallas + 1; end if;
  select count(*) into v_n from public.crm_audit_log where action = 'borrar_vencidos' and actor_id = v_b and (detail->>'mensajes')::int = 1;
  if v_n = 1 then r := r || 'vencidos_auditados=ok '; else r := r || 'vencidos_auditados=MAL '; fallas := fallas + 1; end if;

  -- 7. Borrar a la persona deja el pedido de datos como constancia.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.crm_person_delete(v_person);
  execute 'reset role';
  select count(*) into v_n from public.crm_data_requests where id in (v_req, v_req2) and person_id is null;
  if v_n = 2 then r := r || 'pedido_sobrevive_al_borrado=ok '; else r := r || 'pedido_sobrevive_al_borrado=MAL '; fallas := fallas + 1; end if;
  select count(*) into v_n from public.crm_consents where person_id = v_person;
  if v_n = 0 then r := r || 'constancias_se_borran_con_la_persona=ok '; else r := r || 'constancias_se_borran_con_la_persona=MAL '; fallas := fallas + 1; end if;

  -- 8. Sin acceso al CRM, nada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_today();
    r := r || 'S.sin_hoy=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'S.sin_hoy=ok ';
  end;
  begin
    select count(*) into v_n from public.crm_consents;
    r := r || 'S.sin_constancias=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'S.sin_constancias=ok ';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    perform public.crm_data_requests_list();
    r := r || 'anon.sin_pedidos=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'anon.sin_pedidos=ok ';
  end;
  execute 'reset role';

  raise exception 'FALLAS: % | %', fallas, r;
end;
$$;
