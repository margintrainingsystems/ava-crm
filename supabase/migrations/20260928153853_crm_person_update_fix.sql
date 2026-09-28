-- CRM de AVA · Fase 1: corrige crm_person_update.
-- `text[] || 'pais'` hacía que Postgres leyera 'pais' como un array. array_append no tiene ese problema.

create or replace function public.crm_person_update(
  p_id uuid, p_first_name text, p_last_name text, p_country text, p_tags text[],
  p_email text default null, p_phone text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.crm_people;
  v_contact boolean;
  v_email text;
  v_changed text[] := '{}';
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('personas.editar'));
  select * into v_old from public.crm_people where id = p_id;
  if not found then
    raise exception 'La persona no existe' using errcode = 'P0002';
  end if;
  v_contact := crm_private.crm_has_permission('personas.ver_contacto');

  -- Email y teléfono solo los cambia quien los puede ver.
  v_email := case when v_contact then nullif(btrim(coalesce(p_email, '')), '') else v_old.email end;

  if nullif(btrim(coalesce(p_first_name, '')), '') is distinct from v_old.first_name then v_changed := array_append(v_changed, 'nombre'); end if;
  if nullif(btrim(coalesce(p_last_name, '')), '') is distinct from v_old.last_name then v_changed := array_append(v_changed, 'apellido'); end if;
  if nullif(btrim(coalesce(p_country, '')), '') is distinct from v_old.country then v_changed := array_append(v_changed, 'pais'); end if;
  if coalesce(p_tags, '{}') is distinct from v_old.tags then v_changed := array_append(v_changed, 'etiquetas'); end if;
  if v_contact and v_email is distinct from v_old.email then v_changed := array_append(v_changed, 'email'); end if;
  if v_contact and nullif(btrim(coalesce(p_phone, '')), '') is distinct from v_old.phone then v_changed := array_append(v_changed, 'telefono'); end if;

  if cardinality(v_changed) = 0 then
    return;
  end if;

  update public.crm_people set
    first_name = nullif(btrim(coalesce(p_first_name, '')), ''),
    last_name = nullif(btrim(coalesce(p_last_name, '')), ''),
    country = nullif(btrim(coalesce(p_country, '')), ''),
    tags = (select coalesce(array_agg(distinct t order by t), '{}')
            from unnest(coalesce(p_tags, '{}')) as u(raw), lateral (select btrim(lower(raw)) as t) x
            where t <> '' and char_length(t) <= 40),
    email = v_email,
    email_normalized = case when v_contact then lower(v_email) else email_normalized end,
    phone = case when v_contact then nullif(btrim(coalesce(p_phone, '')), '') else phone end
  where id = p_id;

  -- Solo los nombres de los campos: la auditoría no guarda los datos personales.
  perform crm_private.crm_audit('editar_persona', 'crm_people', p_id::text, jsonb_build_object('campos', to_jsonb(v_changed)));
end;
$$;
