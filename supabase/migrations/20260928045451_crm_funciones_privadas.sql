-- CRM de AVA · Fase 0: saca de la API pública las funciones que usan las políticas RLS.
-- Las políticas guardan la referencia a cada función, así que siguen funcionando
-- después de moverlas. Solo crm_log queda expuesta, porque el CRM la llama para
-- registrar vistas y exportaciones.

create schema if not exists crm_private;
revoke all on schema crm_private from public, anon;
grant usage on schema crm_private to authenticated;

alter function public.crm_is_member() set schema crm_private;
alter function public.crm_is_owner() set schema crm_private;
alter function public.crm_has_permission(text) set schema crm_private;

-- El CRM arma el menú leyendo la fila propia en crm_members y los permisos del rol.
drop function public.crm_my_permissions();

create or replace function public.crm_log(p_action text, p_entity text, p_entity_id text default null, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not crm_private.crm_is_member() then
    raise exception 'Sin acceso al CRM' using errcode = '42501';
  end if;
  if char_length(p_action) > 60 or char_length(p_entity) > 60 or pg_column_size(p_detail) > 8000 then
    raise exception 'Registro demasiado largo' using errcode = '22001';
  end if;
  insert into public.crm_audit_log (actor_id, actor_email, action, entity, entity_id, detail)
  select auth.uid(), m.email, p_action, p_entity, p_entity_id, coalesce(p_detail, '{}'::jsonb)
  from public.crm_members m where m.user_id = auth.uid();
end;
$$;

revoke execute on function public.crm_log(text, text, text, jsonb) from public, anon;
grant execute on function public.crm_log(text, text, text, jsonb) to authenticated;
