-- Prueba de permisos de la fase 0.
-- Correla en el SQL Editor de Supabase o con la herramienta execute_sql.
-- Crea usuarios de prueba, simula cada tipo de cuenta y termina con un error
-- a propósito: así Postgres revierte todo y la base queda igual que antes.
-- Leé el mensaje del error: cada chequeo dice "ok" o "MAL".

do $$
declare
  v_owner uuid := (select user_id from public.crm_members where is_owner);
  v_staff uuid := gen_random_uuid();
  v_student uuid := gen_random_uuid();
  v_role uuid;
  v_n int;
  r text := '';
  fallas int := 0;
begin
  insert into auth.users (id, email, aud, role) values
    (v_staff, 'prueba-staff@example.com', 'authenticated', 'authenticated'),
    (v_student, 'prueba-alumna@example.com', 'authenticated', 'authenticated');

  -- 1. Propietaria: tiene todos los permisos y administra roles.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if crm_private.crm_is_owner() then r := r || 'owner.es_propietaria=ok '; else r := r || 'owner.es_propietaria=MAL '; fallas := fallas + 1; end if;
  if crm_private.crm_has_permission('pagos.ver') then r := r || 'owner.todos_los_permisos=ok '; else r := r || 'owner.todos_los_permisos=MAL '; fallas := fallas + 1; end if;
  insert into public.crm_roles (name, description) values ('Prueba CX', 'rol de prueba') returning id into v_role;
  insert into public.crm_role_permissions values (v_role, 'mensajes.ver'), (v_role, 'personas.ver');
  r := r || 'owner.crea_rol=ok ';
  begin
    update public.crm_members set display_name = 'x' where user_id = v_owner;
    r := r || 'owner.fila_protegida=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'owner.fila_protegida=ok ';
  end;
  execute 'reset role';

  -- Alta del staff como la hace la Edge Function crm-invite (service_role).
  perform set_config('request.jwt.claims', '', true);
  insert into public.crm_members (user_id, email, display_name, role_id, invited_by)
  values (v_staff, 'prueba-staff@example.com', 'Staff', v_role, v_owner);

  -- 2. Staff: solo lo que le da su rol.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if crm_private.crm_is_member() and not crm_private.crm_is_owner() then r := r || 'staff.es_miembro=ok '; else r := r || 'staff.es_miembro=MAL '; fallas := fallas + 1; end if;
  if crm_private.crm_has_permission('mensajes.ver') and not crm_private.crm_has_permission('pagos.ver') then r := r || 'staff.permisos_del_rol=ok '; else r := r || 'staff.permisos_del_rol=MAL '; fallas := fallas + 1; end if;
  select count(*) into v_n from public.crm_members;
  if v_n = 1 then r := r || 'staff.ve_solo_su_fila=ok '; else r := r || 'staff.ve_solo_su_fila=MAL '; fallas := fallas + 1; end if;
  select count(*) into v_n from public.crm_audit_log;
  if v_n = 0 then r := r || 'staff.sin_auditoria=ok '; else r := r || 'staff.sin_auditoria=MAL '; fallas := fallas + 1; end if;
  begin
    insert into public.crm_roles (name) values ('intento');
    r := r || 'staff.no_crea_roles=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'staff.no_crea_roles=ok ';
  end;
  begin
    insert into public.crm_role_permissions values (v_role, 'pagos.ver');
    r := r || 'staff.no_se_da_permisos=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'staff.no_se_da_permisos=ok ';
  end;
  update public.crm_members set role_id = null where user_id = v_staff;
  get diagnostics v_n = row_count;
  if v_n = 0 then r := r || 'staff.no_edita_su_fila=ok '; else r := r || 'staff.no_edita_su_fila=MAL '; fallas := fallas + 1; end if;
  begin
    insert into public.crm_audit_log (action, entity) values ('x', 'y');
    r := r || 'staff.no_escribe_auditoria=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'staff.no_escribe_auditoria=ok ';
  end;
  perform public.crm_log('prueba', 'test', null, '{}');
  r := r || 'staff.registra_con_crm_log=ok ';
  execute 'reset role';

  -- 3. Alumna: cuenta de Supabase sin fila en crm_members.
  perform set_config('request.jwt.claims', json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.crm_roles;
  if v_n = 0 and not crm_private.crm_is_member() then r := r || 'alumna.sin_acceso=ok '; else r := r || 'alumna.sin_acceso=MAL '; fallas := fallas + 1; end if;
  begin
    perform public.crm_log('x', 'y');
    r := r || 'alumna.no_registra=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'alumna.no_registra=ok ';
  end;
  execute 'reset role';

  -- 4. Anónimo: nada del CRM.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    select count(*) into v_n from public.crm_members;
    r := r || 'anon.sin_acceso=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'anon.sin_acceso=ok ';
  end;
  -- 5. El sitio sigue guardando formularios en leads.
  insert into public.leads (source, name, email, privacy_consent) values ('contacto', 'Prueba', 'p@example.com', true);
  r := r || 'anon.leads_del_sitio=ok ';
  execute 'reset role';

  -- 6. Un rol con miembros no se puede borrar.
  begin
    delete from public.crm_roles where id = v_role;
    r := r || 'rol_con_miembros_protegido=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'rol_con_miembros_protegido=ok ';
  end;

  -- 7. La auditoría registró los cambios.
  select count(*) into v_n from public.crm_audit_log where entity = 'crm_role_permissions';
  if v_n = 2 then r := r || 'auditoria_automatica=ok '; else r := r || 'auditoria_automatica=MAL '; fallas := fallas + 1; end if;

  -- 8. crm_save_role: guarda nombre y permisos en una sola operación.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_role := public.crm_save_role(null, '  Docente  ', 'Da clases', array['personas.ver', 'mensajes.ver']);
  perform public.crm_save_role(v_role, 'Docente', 'Da clases', array['mensajes.ver', 'reportes.ver']);
  select count(*) into v_n from public.crm_role_permissions
  where role_id = v_role and permission_key in ('mensajes.ver', 'reportes.ver');
  if v_n = 2 and not exists (select 1 from public.crm_role_permissions where role_id = v_role and permission_key = 'personas.ver')
     and (select name from public.crm_roles where id = v_role) = 'Docente'
  then r := r || 'save_role=ok '; else r := r || 'save_role=MAL '; fallas := fallas + 1; end if;
  execute 'reset role';

  -- 9. Una edición sin cambios no suma filas a la auditoría.
  select count(*) into v_n from public.crm_audit_log where entity = 'crm_roles';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.crm_save_role(v_role, 'Docente', 'Da clases', array['mensajes.ver', 'reportes.ver']);
  execute 'reset role';
  if (select count(*) from public.crm_audit_log where entity = 'crm_roles') = v_n
  then r := r || 'auditoria_sin_ruido=ok '; else r := r || 'auditoria_sin_ruido=MAL '; fallas := fallas + 1; end if;

  -- 10. El staff no puede usar crm_save_role ni las funciones de administración.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_save_role(v_role, 'Hackeo', '', array['pagos.ver']);
    r := r || 'staff.save_role=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'staff.save_role=ok ';
  end;
  begin
    perform public.crm_admin_find_user('prueba-staff@example.com');
    r := r || 'staff.admin_find_user=MAL '; fallas := fallas + 1;
  exception when others then r := r || 'staff.admin_find_user=ok ';
  end;
  execute 'reset role';

  raise exception 'FALLAS: % | %', fallas, r;
end $$;
