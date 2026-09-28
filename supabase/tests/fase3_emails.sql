-- Prueba de la fase 3: cola de emails, confirmación automática, plantillas y permisos.
-- Correla en el SQL Editor de Supabase. Termina con un error a propósito para revertir todo:
-- leé el mensaje, tiene que decir "FALLAS: 0". No manda ningún email: simula a la Edge Function.

do $$
declare
  v_a uuid := gen_random_uuid();   -- docente: ve y responde mensajes, ve personas, sin contacto
  v_b uuid := gen_random_uuid();   -- atención: pedidos y personas con contacto
  v_c uuid := gen_random_uuid();   -- configuración: solo "Editar la configuración"
  v_s uuid := gen_random_uuid();   -- estudiante: sin acceso al CRM
  v_role_a uuid;
  v_role_b uuid;
  v_role_c uuid;
  v_lead uuid;
  v_lead2 uuid;
  v_person uuid;
  v_mail uuid;
  v_mail2 uuid;
  v_manual uuid;
  v_test uuid;
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
    (v_role_b, 'pedidos.gestionar'), (v_role_b, 'personas.ver'), (v_role_b, 'personas.ver_contacto'),
    (v_role_b, 'personas.borrar'),
    (v_role_c, 'configuracion.editar');
  insert into public.crm_members (user_id, email, role_id) values
    (v_a, 'prueba-a@example.com', v_role_a), (v_b, 'prueba-b@example.com', v_role_b),
    (v_c, 'prueba-c@example.com', v_role_c);

  -- 1. El sitio manda un pedido de arrepentimiento: su confirmación queda en la cola con la plantilla.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  insert into public.leads (source, request_code, name, last_name, email)
  values ('arrepentimiento', 'ARR-FASE3A', 'Lucía', 'Gómez', ' lucia.fase3@example.com ');
  insert into public.leads (source, request_code, name, email)
  values ('baja', 'BAJ-FASE3B', 'Sin email válido', 'no-es-un-email');
  insert into public.leads (source, name, email, message, privacy_consent)
  values ('contacto', 'Lucía', 'lucia.fase3@example.com', 'Hola', true);
  execute 'reset role';

  select id, person_id into v_lead, v_person from public.leads where request_code = 'ARR-FASE3A';
  select id into v_mail from public.crm_emails where lead_id = v_lead;
  select e.status = 'pendiente' and e.kind = 'confirmacion' and e.to_email = 'lucia.fase3@example.com'
         and e.subject like '%ARR-FASE3A%' and e.body like 'Hola Lucía:%' and e.person_id = v_person
         and e.template_key = 'confirmacion_arrepentimiento' and e.body not like '%{%'
  into v_ok from public.crm_emails e where e.id = v_mail;
  if v_ok then r := r || 'confirmacion_en_cola=ok '; else r := r || 'confirmacion_en_cola=MAL '; fallas := fallas + 1; end if;
  select count(*) into v_n from public.crm_emails e join public.leads l on l.id = e.lead_id
  where l.request_code = 'BAJ-FASE3B' or (l.source = 'contacto' and l.person_id = v_person);
  if v_n = 0 then r := r || 'sin_email_invalido_ni_contacto=ok '; else r := r || 'sin_email_invalido_ni_contacto=MAL '; fallas := fallas + 1; end if;
  if exists (select 1 from public.leads where request_code = 'BAJ-FASE3B') then r := r || 'pedido_se_guarda_igual=ok '; else r := r || 'pedido_se_guarda_igual=MAL '; fallas := fallas + 1; end if;

  -- 2. Quién ve cada email.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.crm_emails_list() x where x.id = v_mail;
  execute 'reset role';
  if v_n = 0 then r := r || 'A.no_ve_confirmaciones=ok '; else r := r || 'A.no_ve_confirmaciones=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.crm_emails_list() x where x.id = v_mail and x.to_email is not null and x.can_handle;
  execute 'reset role';
  if v_n = 1 then r := r || 'B.ve_y_gestiona_confirmacion=ok '; else r := r || 'B.ve_y_gestiona_confirmacion=MAL '; fallas := fallas + 1; end if;

  -- 3. Escribir un email desde la ficha.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_manual := public.crm_email_compose(v_person, 'Sobre tu consulta', 'Hola Lucía, te cuento...');
  begin
    perform public.crm_email_compose(v_person, 'Sobre tu pedido', 'Hola', v_lead);
    r := r || 'A.no_escribe_sobre_pedidos=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.no_escribe_sobre_pedidos=ok ';
  end;
  begin
    perform public.crm_email_compose(v_person, '   ', 'Hola');
    r := r || 'A.pide_asunto=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'A.pide_asunto=ok ';
  end;
  select count(*) into v_n from public.crm_emails_list() x where x.id = v_manual and x.to_email is null and x.contact_hidden;
  v_j := public.crm_person_detail(v_person);
  execute 'reset role';
  if v_n = 1 then r := r || 'A.escribe_sin_ver_el_email=ok '; else r := r || 'A.escribe_sin_ver_el_email=MAL '; fallas := fallas + 1; end if;
  select to_email = 'lucia.fase3@example.com' and created_by = v_a into v_ok from public.crm_emails where id = v_manual;
  if v_ok then r := r || 'direccion_la_pone_la_base=ok '; else r := r || 'direccion_la_pone_la_base=MAL '; fallas := fallas + 1; end if;
  if jsonb_array_length(v_j->'emails') = 1 and v_j->'emails'->0->>'id' = v_manual::text then r := r || 'A.ficha_con_sus_emails=ok '; else r := r || 'A.ficha_con_sus_emails=MAL '; fallas := fallas + 1; end if;
  if exists (select 1 from public.crm_audit_log where action = 'escribir_email' and actor_id = v_a and detail::text not ilike '%lucia%')
  then r := r || 'escribir_auditado=ok '; else r := r || 'escribir_auditado=MAL '; fallas := fallas + 1; end if;

  -- 4. Confirmar a mano cancela el email automático pendiente.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.crm_message_confirm(v_lead);
  execute 'reset role';
  select status = 'cancelado' into v_ok from public.crm_emails where id = v_mail;
  if v_ok then r := r || 'confirmar_a_mano_cancela=ok '; else r := r || 'confirmar_a_mano_cancela=MAL '; fallas := fallas + 1; end if;

  -- 5. La Edge Function (service_role): toma la cola, manda y registra el resultado.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  insert into public.leads (source, request_code, name, email)
  values ('baja', 'BAJ-FASE3C', 'Martín', 'martin.fase3@example.com');
  execute 'reset role';
  select id into v_lead2 from public.leads where request_code = 'BAJ-FASE3C';
  select id into v_mail2 from public.crm_emails where lead_id = v_lead2;

  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_b)::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_email_claim(null, 20);
    r := r || 'equipo_no_toma_la_cola=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'equipo_no_toma_la_cola=ok ';
  end;
  begin
    perform public.crm_cron_token_ok('x');
    r := r || 'equipo_no_prueba_tokens=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'equipo_no_prueba_tokens=ok ';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  select public.crm_cron_token_ok((select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_token'))
         and not public.crm_cron_token_ok('token-inventado') and not public.crm_cron_token_ok(null)
  into v_ok;
  execute 'reset role';
  if v_ok then r := r || 'token_del_cron=ok '; else r := r || 'token_del_cron=MAL '; fallas := fallas + 1; end if;

  -- Sin confirmación automática, el cron no toma las confirmaciones (sí los emails escritos).
  update public.crm_email_settings set auto_confirm = false where id = 1;
  execute 'set local role service_role';
  select count(*) filter (where c.id = v_mail2) into v_n from public.crm_email_claim(null, 50) c;
  execute 'reset role';
  if v_n = 0 then r := r || 'sin_auto_no_confirma=ok '; else r := r || 'sin_auto_no_confirma=MAL '; fallas := fallas + 1; end if;
  select status = 'enviando' and attempts = 1 into v_ok from public.crm_emails where id = v_manual;
  if v_ok then r := r || 'toma_los_escritos=ok '; else r := r || 'toma_los_escritos=MAL '; fallas := fallas + 1; end if;
  update public.crm_email_settings set auto_confirm = true where id = 1;

  execute 'set local role service_role';
  select count(*) into v_n from public.crm_email_claim(null, 50) c where c.id = v_mail2;
  perform public.crm_email_mark(v_mail2, true, 're_prueba_123', null);
  -- Un fallo: vuelve a la cola con el error anotado.
  perform public.crm_email_mark(v_manual, false, null, 'Resend respondió 422: dominio sin verificar');
  execute 'reset role';
  if v_n = 1 then r := r || 'con_auto_toma_confirmacion=ok '; else r := r || 'con_auto_toma_confirmacion=MAL '; fallas := fallas + 1; end if;
  select e.status = 'enviado' and e.provider_id = 're_prueba_123' and l.confirmed_at is not null
  into v_ok from public.crm_emails e join public.leads l on l.id = e.lead_id where e.id = v_mail2;
  if v_ok then r := r || 'enviado_confirma_el_pedido=ok '; else r := r || 'enviado_confirma_el_pedido=MAL '; fallas := fallas + 1; end if;
  if exists (select 1 from public.crm_audit_log where action = 'confirmar_pedido' and entity_id = v_lead2::text and detail->>'via' = 'email automatico')
  then r := r || 'confirmacion_auditada=ok '; else r := r || 'confirmacion_auditada=MAL '; fallas := fallas + 1; end if;
  select status = 'pendiente' and last_error like 'Resend respondió 422%' and next_attempt_at > now() into v_ok from public.crm_emails where id = v_manual;
  if v_ok then r := r || 'fallo_reintenta=ok '; else r := r || 'fallo_reintenta=MAL '; fallas := fallas + 1; end if;

  -- Al tercer intento fallido queda como fallido y Hoy lo avisa.
  update public.crm_emails set attempts = 3, status = 'enviando' where id = v_manual;
  execute 'set local role service_role';
  perform public.crm_email_mark(v_manual, false, null, 'Resend respondió 422: dominio sin verificar');
  execute 'reset role';
  select status = 'fallido' into v_ok from public.crm_emails where id = v_manual;
  if v_ok then r := r || 'tres_fallos_fallido=ok '; else r := r || 'tres_fallos_fallido=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_j := public.crm_today();
  perform public.crm_email_request_send(v_manual);
  execute 'reset role';
  if (v_j->>'failed_emails')::int >= 1 and v_j ? 'email_ready' then r := r || 'A.hoy_avisa_fallidos=ok '; else r := r || 'A.hoy_avisa_fallidos=MAL '; fallas := fallas + 1; end if;
  select status = 'pendiente' and attempts = 2 into v_ok from public.crm_emails where id = v_manual;
  if v_ok then r := r || 'reintentar_a_mano=ok '; else r := r || 'reintentar_a_mano=MAL '; fallas := fallas + 1; end if;

  -- 6. Cancelar.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.crm_email_cancel(v_manual);
  begin
    perform public.crm_email_cancel(v_manual);
    r := r || 'no_cancela_dos_veces=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'no_cancela_dos_veces=ok ';
  end;
  begin
    perform public.crm_email_cancel(v_mail2);
    r := r || 'A.no_cancela_confirmaciones=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.no_cancela_confirmaciones=ok ';
  end;
  execute 'reset role';
  select status = 'cancelado' and cancel_reason like 'Lo canceló prueba-a@%' into v_ok from public.crm_emails where id = v_manual;
  if v_ok then r := r || 'cancelado_con_quien=ok '; else r := r || 'cancelado_con_quien=MAL '; fallas := fallas + 1; end if;

  -- 7. Plantillas, remitente y prueba: solo con "Editar la configuración".
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.crm_email_templates;
  begin
    perform public.crm_email_template_save('confirmacion_baja', 'x', 'y');
    r := r || 'A.no_edita_plantillas=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.no_edita_plantillas=ok ';
  end;
  begin
    perform public.crm_email_test('prueba-a@example.com');
    r := r || 'A.no_manda_pruebas=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.no_manda_pruebas=ok ';
  end;
  execute 'reset role';
  if v_n >= 2 then r := r || 'A.lee_plantillas=ok '; else r := r || 'A.lee_plantillas=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.crm_email_template_save('confirmacion_baja', 'Tu baja ({codigo})', 'Hola {nombre}, listo. Código {codigo}.');
  begin
    perform public.crm_email_settings_save('AVA', 'no es un email', null, true);
    r := r || 'C.remitente_invalido=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'C.remitente_invalido=ok ';
  end;
  perform public.crm_email_settings_save('AVA', ' Hola@AprendeConAva.com ', 'hola@aprendeconava.com', true);
  v_test := public.crm_email_test('prueba-c@example.com');
  select count(*) into v_n from public.crm_emails_list() x where x.id = v_test and x.to_email = 'prueba-c@example.com';
  v_j := public.crm_today();
  execute 'reset role';
  if v_n = 1 then r := r || 'C.ve_su_prueba=ok '; else r := r || 'C.ve_su_prueba=MAL '; fallas := fallas + 1; end if;
  if not v_j ? 'failed_emails' then r := r || 'C.hoy_sin_emails=ok '; else r := r || 'C.hoy_sin_emails=MAL '; fallas := fallas + 1; end if;
  select from_address = 'hola@aprendeconava.com' and not provider_ready into v_ok from public.crm_email_settings where id = 1;
  if v_ok then r := r || 'remitente_normalizado=ok '; else r := r || 'remitente_normalizado=MAL '; fallas := fallas + 1; end if;
  if exists (select 1 from public.crm_audit_log where action = 'editar_plantilla' and entity_id = 'confirmacion_baja' and actor_id = v_c)
     and exists (select 1 from public.crm_audit_log where action = 'editar_config_email' and actor_id = v_c)
  then r := r || 'configuracion_auditada=ok '; else r := r || 'configuracion_auditada=MAL '; fallas := fallas + 1; end if;

  -- La plantilla editada se usa en el pedido siguiente.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  insert into public.leads (source, request_code, name, email) values ('baja', 'BAJ-FASE3D', 'Eva', 'eva.fase3@example.com');
  execute 'reset role';
  select e.subject = 'Tu baja (BAJ-FASE3D)' and e.body = 'Hola Eva, listo. Código BAJ-FASE3D.' into v_ok
  from public.crm_emails e join public.leads l on l.id = e.lead_id where l.request_code = 'BAJ-FASE3D';
  if v_ok then r := r || 'usa_la_plantilla_editada=ok '; else r := r || 'usa_la_plantilla_editada=MAL '; fallas := fallas + 1; end if;

  -- 8. Estudiante y anónimo: nada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.crm_email_templates;
  begin
    perform public.crm_emails_list();
    r := r || 'S.sin_emails=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'S.sin_emails=ok ';
  end;
  begin
    select count(*) into v_n from public.crm_emails;
    r := r || 'S.sin_tabla=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'S.sin_tabla=ok ';
  end;
  execute 'reset role';
  if v_n = 0 then r := r || 'S.sin_plantillas=ok '; else r := r || 'S.sin_plantillas=MAL '; fallas := fallas + 1; end if;

  -- 9. Borrar a la persona borra sus emails.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.crm_person_delete(v_person);
  execute 'reset role';
  select count(*) into v_n from public.crm_emails where person_id = v_person or id in (v_mail, v_manual);
  if v_n = 0 then r := r || 'borrar_persona_borra_emails=ok '; else r := r || 'borrar_persona_borra_emails=MAL '; fallas := fallas + 1; end if;

  raise exception 'FALLAS: % | %', fallas, r;
end;
$$;
