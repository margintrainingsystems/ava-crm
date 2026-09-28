-- CRM de AVA · Fase 0: funciones para invitar al equipo y guardar roles.

-- Búsqueda de cuentas por email y estado de las invitaciones.
-- Solo las usa la Edge Function crm-equipo con service_role: nadie las puede llamar desde el navegador.
create function public.crm_admin_find_user(p_email text)
returns table (id uuid, email_confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.email_confirmed_at, u.last_sign_in_at
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
$$;

create function public.crm_admin_users_status(p_ids uuid[])
returns table (id uuid, invited_at timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.invited_at, u.email_confirmed_at, u.last_sign_in_at
  from auth.users u
  where u.id = any(p_ids);
$$;

revoke execute on function public.crm_admin_find_user(text), public.crm_admin_users_status(uuid[])
  from public, anon, authenticated;
grant execute on function public.crm_admin_find_user(text), public.crm_admin_users_status(uuid[])
  to service_role;

-- Guarda un rol y su lista de permisos en una sola operación.
-- Corre con los permisos de quien la llama (security invoker): las políticas RLS
-- dejan que solo la propietaria cree o cambie roles.
create function public.crm_save_role(p_id uuid, p_name text, p_description text, p_permissions text[])
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_permissions text[] := coalesce(p_permissions, '{}');
begin
  if p_id is null then
    insert into public.crm_roles (name, description)
    values (btrim(p_name), coalesce(btrim(p_description), ''))
    returning id into v_id;
  else
    update public.crm_roles
    set name = btrim(p_name), description = coalesce(btrim(p_description), '')
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'El rol no existe o no tenés permiso para editarlo' using errcode = 'P0002';
    end if;
  end if;

  delete from public.crm_role_permissions
  where role_id = v_id and not (permission_key = any (v_permissions));

  insert into public.crm_role_permissions (role_id, permission_key)
  select v_id, k from unnest(v_permissions) as k
  on conflict do nothing;

  return v_id;
end;
$$;

revoke execute on function public.crm_save_role(uuid, text, text, text[]) from public, anon;
grant execute on function public.crm_save_role(uuid, text, text, text[]) to authenticated;

-- La auditoría ignora las ediciones que no cambian nada (solo updated_at).
create or replace function public.crm_audit_changes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_entity_id text;
  v_detail jsonb;
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return new;
  end if;

  if tg_table_name = 'crm_role_permissions' then
    v_entity_id := coalesce(new.role_id, old.role_id)::text;
    v_detail := jsonb_build_object('permiso', coalesce(new.permission_key, old.permission_key));
  elsif tg_table_name = 'crm_members' then
    v_entity_id := coalesce(new.user_id, old.user_id)::text;
    v_detail := jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new));
  else
    v_entity_id := coalesce(new.id, old.id)::text;
    v_detail := jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new));
  end if;

  insert into public.crm_audit_log (actor_id, actor_email, action, entity, entity_id, detail)
  values (
    auth.uid(),
    (select m.email from public.crm_members m where m.user_id = auth.uid()),
    lower(tg_op),
    tg_table_name,
    v_entity_id,
    jsonb_strip_nulls(v_detail)
  );
  return coalesce(new, old);
end;
$$;

revoke execute on function public.crm_audit_changes() from public, anon, authenticated;
