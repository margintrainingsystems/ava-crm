# CRM de AVA: guía para Claude Code

Leé el README antes de cambiar algo. Resumen de lo que no se negocia:

- Idioma de la interfaz y de los textos: español rioplatense con voseo ("elegí", "podés"). Nada de notas de desarrollo visibles.
- La dueña es Aimar Merino, la única propietaria (`crm_members.is_owner`). Siempre en femenino.
- Supabase compartido con el sitio (`aprendeconava`) y Núcleo (`ava-nucleo`): proyecto `mryuhzpenzpyhfidwsup`. No romper los INSERT públicos en `leads` ni sus políticas.
- Núcleo es solo de la dueña y administra todo: sitio, equipo, roles, auditoría y configuración del CRM. El CRM es la herramienta de trabajo que se comparte. Nada de administración del equipo va en el CRM.
- Tablas del CRM con prefijo `crm_`, RLS obligatorio, helpers en `crm_private`. Cambios de base solo con migraciones en `supabase/migrations/` con el mismo nombre y versión que quedan en Supabase.
- Nunca pedir ni guardar datos de tarjetas, DNI ni datos sensibles. La `service_role` solo en Edge Functions.
- Todo lo que se sube a GitHub va directo a `main`. El plan de trabajo queda local, fuera del repo.
- Antes de subir: `npm run check`, `npm run build` y cada script de `supabase/tests/` con `FALLAS: 0`.
- Personas y mensajes se leen solo con las funciones `crm_*` (security definer que revisan permisos y ocultan contacto). No agregues políticas que den acceso directo a `leads` o `crm_people`.
- Diseño: tokens en `src/styles/tokens.css`. Verde como color principal; acentos solo en detalles. Sin glassmorphism, sin cajas de métricas en grupos de 3 o 4, sin etiquetas decorativas sobre los títulos, sin métricas inventadas.
- Si falta una definición (cupo, plataforma del Campus, textos legales), preguntale a la dueña. No la completes por tu cuenta.
- Los plazos legales se calculan en la base (`crm_private.crm_add_business_days`, triggers de `crm_data_requests`). Los feriados los carga la dueña desde Núcleo con la lista oficial: nunca los cargues de memoria.
- Los emails salen solo por la cola `crm_emails` y la Edge Function `crm-emails`. La clave de Resend vive únicamente como secreto de esa función. Nunca mandes emails reales en las pruebas: simulá la función con `crm_email_claim` y `crm_email_mark`.
