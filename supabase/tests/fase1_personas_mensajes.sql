-- Prueba de la fase 1: personas y mensajes.
-- Correla en el SQL Editor de Supabase. Termina con un error a propósito para revertir todo:
-- leé el mensaje, tiene que decir "FALLAS: 0".

do $$
declare
  v_owner uuid := (select user_id from public.crm_members where is_owner);
  v_a uuid := gen_random_uuid();   -- docente: ve y responde mensajes, ve personas sin contacto
  v_b uuid := gen_random_uuid();   -- atención: todo lo de personas y pedidos
  v_s uuid := gen_random_uuid();   -- estudiante: sin acceso al CRM
  v_role_a uuid;
  v_role_b uuid;
  v_person uuid;
  v_contact_id uuid;
  v_request_id uuid;
  v_n int;
  v_j jsonb;
  v_ok boolean;
  r text := '';
  fallas int := 0;
begin
  insert into auth.users (id, email, aud, role) values
    (v_a, 'prueba-a@example.com', 'authenticated', 'authenticated'),
    (v_b, 'prueba-b@example.com', 'authenticated', 'authenticated'),
    (v_s, 'prueba-s@example.com', 'authenticated', 'authenticated');
  insert into public.crm_roles (name) values ('Prueba A') returning id into v_role_a;
  insert into public.crm_roles (name) values ('Prueba B') returning id into v_role_b;
  insert into public.crm_role_permissions values
    (v_role_a, 'mensajes.ver'), (v_role_a, 'mensajes.responder'), (v_role_a, 'personas.ver'),
    (v_role_b, 'mensajes.ver'), (v_role_b, 'pedidos.gestionar'), (v_role_b, 'personas.ver'),
    (v_role_b, 'personas.ver_contacto'), (v_role_b, 'personas.editar'), (v_role_b, 'personas.borrar');
  insert into public.crm_members (user_id, email, role_id) values
    (v_a, 'prueba-a@example.com', v_role_a), (v_b, 'prueba-b@example.com', v_role_b);

  -- 1. El sitio (anónimo) manda tres formularios con el mismo email, con mayúsculas distintas
  --    y con un person_id inventado: el trigger lo reemplaza.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  insert into public.leads (source, name, email, message, privacy_consent, person_id)
  values ('contacto', 'Lucía', ' Lucia.Prueba@Example.com ', 'Hola', true, gen_random_uuid());
  insert into public.leads (source, name, last_name, email, country, privacy_consent, adult_confirmed)
  values ('suscripcion', 'Otro nombre', 'Gómez', 'lucia.prueba@example.com', 'Argentina', true, true);
  insert into public.leads (source, request_code, name, last_name, email, phone)
  values ('arrepentimiento', 'ARR-PRUEBA', 'Lucía', 'Gómez', 'lucia.prueba@example.com', '1155550000');
  execute 'reset role';

  select count(distinct person_id), min(person_id::text)::uuid into v_n, v_person
  from public.leads where lower(btrim(email)) = 'lucia.prueba@example.com';
  if v_n = 1 and v_person is not null then r := r || 'una_persona_por_email=ok '; else r := r || 'una_persona_por_email=MAL '; fallas := fallas + 1; end if;
  select (first_name = 'Lucía' and last_name = 'Gómez' and country = 'Argentina' and phone = '1155550000')
  into v_ok from public.crm_people where id = v_person;
  if v_ok then r := r || 'completa_sin_pisar=ok '; else r := r || 'completa_sin_pisar=MAL '; fallas := fallas + 1; end if;
  select id into v_contact_id from public.leads where email = ' Lucia.Prueba@Example.com ';
  select id into v_request_id from public.leads where request_code = 'ARR-PRUEBA';

  -- 2. Docente (A)
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.crm_messages_list() m where m.person_id = v_person;
  if v_n = 2 then r := r || 'A.no_ve_pedidos=ok '; else r := r || 'A.no_ve_pedidos=MAL '; fallas := fallas + 1; end if;
  select bool_and(m.email is null and m.contact_hidden) into v_ok from public.crm_messages_list() m where m.person_id = v_person;
  if v_ok then r := r || 'A.email_oculto=ok '; else r := r || 'A.email_oculto=MAL '; fallas := fallas + 1; end if;
  perform public.crm_message_update(v_contact_id, 'leido', 'Le respondí', true);
  r := r || 'A.responde_contacto=ok ';
  begin
    perform public.crm_message_update(v_request_id, 'archivado');
    r := r || 'A.toca_pedido=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'A.toca_pedido=ok ';
  end;
  begin
    perform public.crm_message_delete(v_contact_id);
    r := r || 'A.borra=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'A.borra=ok ';
  end;
  v_j := public.crm_person_detail(v_person);
  if (v_j->'person'->>'email') is null and jsonb_array_length(v_j->'messages') = 2 and (v_j->>'hidden_messages')::int = 1
  then r := r || 'A.ficha_filtrada=ok '; else r := r || 'A.ficha_filtrada=MAL '; fallas := fallas + 1; end if;
  begin
    perform public.crm_person_update(v_person, 'X', 'Y', null, '{}');
    r := r || 'A.edita=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'A.edita=ok ';
  end;
  begin
    select count(*) into v_n from public.crm_people;
    r := r || 'A.lee_tabla_directo=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'A.lee_tabla_directo=ok ';
  end;
  select count(*) into v_n from public.leads;
  if v_n = 0 then r := r || 'A.leads_directo_vacio=ok '; else r := r || 'A.leads_directo_vacio=MAL '; fallas := fallas + 1; end if;
  execute 'reset role';

  if exists (select 1 from public.crm_audit_log where action = 'ver_persona' and actor_id = v_a)
  then r := r || 'auditoria_ver_ficha=ok '; else r := r || 'auditoria_ver_ficha=MAL '; fallas := fallas + 1; end if;

  -- 3. Atención (B)
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.crm_messages_list() m where m.person_id = v_person and m.email is not null;
  if v_n = 3 then r := r || 'B.ve_todo_con_email=ok '; else r := r || 'B.ve_todo_con_email=MAL '; fallas := fallas + 1; end if;
  perform public.crm_message_confirm(v_request_id);
  perform public.crm_person_update(v_person, 'Lucía', 'Gómez', 'Uruguay', array[' Beca ', 'beca', 'VIP'], 'lucia.nueva@example.com', '1155550000');
  perform public.crm_person_add_note(v_person, 'Llamé el martes.');
  execute 'reset role';

  if (select confirmed_at is not null from public.leads where id = v_request_id)
     and exists (select 1 from public.crm_audit_log where action = 'confirmar_pedido' and detail->>'codigo' = 'ARR-PRUEBA')
  then r := r || 'B.confirma_con_auditoria=ok '; else r := r || 'B.confirma_con_auditoria=MAL '; fallas := fallas + 1; end if;
  if (select tags = array['beca', 'vip'] and email_normalized = 'lucia.nueva@example.com' and country = 'Uruguay'
      from public.crm_people where id = v_person)
  then r := r || 'B.edita_normalizado=ok '; else r := r || 'B.edita_normalizado=MAL '; fallas := fallas + 1; end if;
  if not exists (select 1 from public.crm_audit_log where action = 'editar_persona' and detail::text ilike '%lucia%')
  then r := r || 'auditoria_sin_datos_personales=ok '; else r := r || 'auditoria_sin_datos_personales=MAL '; fallas := fallas + 1; end if;

  -- 4. Estudiante y anónimo
  perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.crm_messages_list();
  if v_n = 0 then r := r || 'alumna.sin_mensajes=ok '; else r := r || 'alumna.sin_mensajes=MAL '; fallas := fallas + 1; end if;
  begin
    perform public.crm_person_detail(v_person);
    r := r || 'alumna.sin_ficha=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'alumna.sin_ficha=ok ';
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    perform public.crm_messages_list();
    r := r || 'anon.sin_rpc=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'anon.sin_rpc=ok ';
  end;
  execute 'reset role';

  -- 5. Núcleo sigue viendo leads como antes (la propietaria es admin).
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.leads where person_id = v_person;
  if v_n = 3 then r := r || 'nucleo_ve_leads=ok '; else r := r || 'nucleo_ve_leads=MAL '; fallas := fallas + 1; end if;
  if public.crm_messages_unread_count() >= 2 then r := r || 'contador_sin_leer=ok '; else r := r || 'contador_sin_leer=MAL '; fallas := fallas + 1; end if;
  execute 'reset role';

  -- 6. Borrar a la persona borra sus mensajes y notas.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.crm_person_delete(v_person);
  execute 'reset role';
  if not exists (select 1 from public.leads where person_id = v_person or request_code = 'ARR-PRUEBA')
     and not exists (select 1 from public.crm_people where id = v_person)
     and not exists (select 1 from public.crm_person_notes where person_id = v_person)
  then r := r || 'borrado_completo=ok '; else r := r || 'borrado_completo=MAL '; fallas := fallas + 1; end if;

  raise exception 'FALLAS: % | %', fallas, r;
end $$;
