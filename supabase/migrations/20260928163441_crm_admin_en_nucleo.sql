-- CRM de AVA: la administración del CRM pasa a Núcleo.
-- Equipo, roles y auditoría los maneja solo la propietaria desde Núcleo.
-- La auditoría deja de ser un permiso que se pueda dar a un rol.

delete from public.crm_permissions where key = 'auditoria.ver';

drop policy crm_audit_log_select on public.crm_audit_log;
create policy crm_audit_log_select on public.crm_audit_log
  for select to authenticated using ((select crm_private.crm_is_owner()));
