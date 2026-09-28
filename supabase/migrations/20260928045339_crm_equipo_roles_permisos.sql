-- CRM de AVA · Fase 0: equipo, roles, permisos y auditoría.
-- Las tablas usan el prefijo crm_ en el schema public, así la API de Supabase
-- las expone sin cambiar la configuración del proyecto.
-- No toca ninguna tabla del sitio ni de Núcleo.

-- ---------------------------------------------------------------------------
-- Catálogo fijo de permisos. Lo define el código; los roles son libres.
-- ---------------------------------------------------------------------------
create table public.crm_permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  area text not null check (char_length(area) between 1 and 60),
  label text not null check (char_length(label) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  sort_order integer not null default 0
);

comment on table public.crm_permissions is
  'Catálogo fijo de permisos del CRM. Solo cambia por migración.';

insert into public.crm_permissions (key, area, label, description, sort_order) values
  ('personas.ver',            'Personas',       'Ver personas',                        'Ver fichas y línea de tiempo, sin email ni teléfono.', 10),
  ('personas.ver_contacto',   'Personas',       'Ver email y teléfono',                'Ver los datos de contacto de cada persona.', 20),
  ('personas.editar',         'Personas',       'Editar personas',                     'Corregir datos, etiquetas y notas.', 30),
  ('personas.exportar',       'Personas',       'Exportar datos',                      'Descargar CSV o el paquete de datos de una persona.', 40),
  ('personas.borrar',         'Personas',       'Borrar datos personales',             'Eliminar a una persona y todo lo asociado.', 50),
  ('mensajes.ver',            'Mensajes',       'Ver mensajes',                        'Ver lo que llega por los formularios del sitio.', 110),
  ('mensajes.responder',      'Mensajes',       'Responder mensajes',                  'Responder, archivar y escribir notas internas.', 120),
  ('pedidos.gestionar',       'Pedidos legales','Gestionar arrepentimiento y baja',    'Confirmar pedidos y registrar devoluciones y bajas.', 210),
  ('derechos.gestionar',      'Pedidos legales','Gestionar pedidos de datos',          'Atender pedidos de acceso, corrección y borrado.', 220),
  ('suscripciones.ver',       'Suscripciones',  'Ver suscripciones',                   'Ver estado, fechas y plazos de cada suscripción.', 310),
  ('suscripciones.gestionar', 'Suscripciones',  'Gestionar suscripciones',             'Registrar bajas, extensiones y suspensiones.', 320),
  ('pagos.ver',               'Suscripciones',  'Ver pagos',                           'Ver montos, monedas y números de operación.', 330),
  ('sorteo.gestionar',        'Sorteo',         'Gestionar el sorteo de becas',        'Numerar la lista, sortear y registrar respuestas.', 410),
  ('reportes.ver',            'Reportes',       'Ver reportes',                        'Ver el embudo, los cupos y los ingresos.', 510),
  ('configuracion.editar',    'Configuración',  'Editar la configuración',             'Cambiar cupos, plantillas de email y plazos.', 610),
  ('auditoria.ver',           'Equipo',         'Ver la auditoría',                    'Ver quién vio, cambió, exportó o borró datos.', 710);

-- ---------------------------------------------------------------------------
-- Roles y sus permisos
-- ---------------------------------------------------------------------------
create table public.crm_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_role_permissions (
  role_id uuid not null references public.crm_roles (id) on delete cascade,
  permission_key text not null references public.crm_permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

create index crm_role_permissions_permission_idx on public.crm_role_permissions (permission_key);

-- ---------------------------------------------------------------------------
-- Miembros del equipo. La propietaria tiene todos los permisos.
-- ---------------------------------------------------------------------------
create table public.crm_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  display_name text not null default '' check (char_length(display_name) <= 120),
  role_id uuid references public.crm_roles (id) on delete restrict,
  is_owner boolean not null default false,
  active boolean not null default true,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_members_role_or_owner check (is_owner or role_id is not null)
);

create unique index crm_members_single_owner on public.crm_members (is_owner) where is_owner;
create index crm_members_role_idx on public.crm_members (role_id);
create index crm_members_invited_by_idx on public.crm_members (invited_by);

-- ---------------------------------------------------------------------------
-- Auditoría: solo se agrega, nadie la edita ni la borra desde la API.
-- ---------------------------------------------------------------------------
create table public.crm_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null check (char_length(action) between 1 and 60),
  entity text not null check (char_length(entity) between 1 and 60),
  entity_id text,
  detail jsonb not null default '{}'::jsonb
);

create index crm_audit_log_at_idx on public.crm_audit_log (at desc);
create index crm_audit_log_entity_idx on public.crm_audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- Funciones de acceso
-- ---------------------------------------------------------------------------
create function public.crm_is_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.crm_members m
    where m.user_id = auth.uid() and m.active
  );
$$;

create function public.crm_is_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.crm_members m
    where m.user_id = auth.uid() and m.active and m.is_owner
  );
$$;

create function public.crm_has_permission(p_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.crm_members m
    left join public.crm_role_permissions rp
      on rp.role_id = m.role_id and rp.permission_key = p_key
    where m.user_id = auth.uid()
      and m.active
      and (m.is_owner or rp.permission_key is not null)
  );
$$;

-- Permisos efectivos de quien está logueado (para armar el menú).
create function public.crm_my_permissions()
returns table (permission_key text)
language sql stable security definer set search_path = ''
as $$
  select p.key
  from public.crm_permissions p
  join public.crm_members m on m.user_id = auth.uid() and m.active
  where m.is_owner
     or exists (
       select 1 from public.crm_role_permissions rp
       where rp.role_id = m.role_id and rp.permission_key = p.key
     );
$$;

-- Registro manual de eventos (por ejemplo, "vio el email de una persona").
create function public.crm_log(p_action text, p_entity text, p_entity_id text default null, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.crm_is_member() then
    raise exception 'Sin acceso al CRM' using errcode = '42501';
  end if;
  insert into public.crm_audit_log (actor_id, actor_email, action, entity, entity_id, detail)
  select auth.uid(), m.email, p_action, p_entity, p_entity_id, coalesce(p_detail, '{}'::jsonb)
  from public.crm_members m where m.user_id = auth.uid();
end;
$$;

revoke execute on function public.crm_is_member(), public.crm_is_owner(),
  public.crm_has_permission(text), public.crm_my_permissions(),
  public.crm_log(text, text, text, jsonb) from public, anon;
grant execute on function public.crm_is_member(), public.crm_is_owner(),
  public.crm_has_permission(text), public.crm_my_permissions(),
  public.crm_log(text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Protección de la fila de la propietaria
-- ---------------------------------------------------------------------------
create function public.crm_members_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- auth.uid() es null cuando opera una migración o una Edge Function con service_role.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and new.is_owner then
    raise exception 'No se puede crear otra propietaria' using errcode = '42501';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.is_owner then
    raise exception 'La cuenta propietaria no se puede modificar ni quitar desde el CRM' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.is_owner or new.user_id <> old.user_id or new.email <> old.email) then
    raise exception 'Solo se pueden cambiar el nombre, el rol y el estado' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger crm_members_guard
  before insert or update or delete on public.crm_members
  for each row execute function public.crm_members_guard();

create trigger set_updated_at before update on public.crm_roles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.crm_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auditoría automática de cambios en el equipo
-- ---------------------------------------------------------------------------
create function public.crm_audit_changes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_entity_id text;
  v_detail jsonb;
begin
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

revoke execute on function public.crm_audit_changes(), public.crm_members_guard() from public, anon, authenticated;

create trigger crm_audit after insert or update or delete on public.crm_roles
  for each row execute function public.crm_audit_changes();
create trigger crm_audit after insert or delete on public.crm_role_permissions
  for each row execute function public.crm_audit_changes();
create trigger crm_audit after insert or update or delete on public.crm_members
  for each row execute function public.crm_audit_changes();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.crm_permissions enable row level security;
alter table public.crm_roles enable row level security;
alter table public.crm_role_permissions enable row level security;
alter table public.crm_members enable row level security;
alter table public.crm_audit_log enable row level security;

revoke all on public.crm_permissions, public.crm_roles, public.crm_role_permissions,
  public.crm_members, public.crm_audit_log from anon;
revoke truncate, references, trigger on public.crm_permissions, public.crm_roles,
  public.crm_role_permissions, public.crm_members, public.crm_audit_log from authenticated;
revoke insert, update, delete on public.crm_permissions, public.crm_audit_log from authenticated;
revoke insert on public.crm_members from authenticated;
revoke update on public.crm_role_permissions from authenticated;

create policy crm_permissions_select on public.crm_permissions
  for select to authenticated using ((select public.crm_is_member()));

create policy crm_roles_select on public.crm_roles
  for select to authenticated using ((select public.crm_is_member()));
create policy crm_roles_insert on public.crm_roles
  for insert to authenticated with check ((select public.crm_is_owner()));
create policy crm_roles_update on public.crm_roles
  for update to authenticated using ((select public.crm_is_owner())) with check ((select public.crm_is_owner()));
create policy crm_roles_delete on public.crm_roles
  for delete to authenticated using ((select public.crm_is_owner()));

create policy crm_role_permissions_select on public.crm_role_permissions
  for select to authenticated using ((select public.crm_is_member()));
create policy crm_role_permissions_insert on public.crm_role_permissions
  for insert to authenticated with check ((select public.crm_is_owner()));
create policy crm_role_permissions_delete on public.crm_role_permissions
  for delete to authenticated using ((select public.crm_is_owner()));

create policy crm_members_select on public.crm_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.crm_is_owner()));
create policy crm_members_update on public.crm_members
  for update to authenticated
  using ((select public.crm_is_owner())) with check ((select public.crm_is_owner()));
create policy crm_members_delete on public.crm_members
  for delete to authenticated using ((select public.crm_is_owner()));
-- Las altas de miembros las hace la Edge Function crm-invite con service_role.

create policy crm_audit_log_select on public.crm_audit_log
  for select to authenticated using ((select public.crm_has_permission('auditoria.ver')));

-- ---------------------------------------------------------------------------
-- La admin actual de Núcleo pasa a ser la propietaria del CRM.
-- ---------------------------------------------------------------------------
insert into public.crm_members (user_id, email, display_name, is_owner)
select a.user_id, u.email, 'Aimar Merino', true
from public.admins a
join auth.users u on u.id = a.user_id
order by a.created_at
limit 1;
