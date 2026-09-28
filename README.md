# CRM de AVA

Herramienta de trabajo diario que la dueña de AVA comparte con su equipo: personas, mensajes y, por fases, pedidos legales, suscripciones y el sorteo de becas.

**Núcleo** (`https://ava-nucleo.netlify.app`, repo `ava-nucleo`) es el panel privado de la dueña: desde ahí administra el sitio y también el CRM (equipo, roles y permisos, auditoría y configuración). Los dos usan el mismo proyecto de Supabase.

Hoy el CRM tiene las **fases 0 a 3 y la primera parte de la fase 4**: acceso con permisos por rol, personas, mensajes, plazos legales, pedidos de datos, consentimientos, retención, emails (listos para activar con Resend), suscripciones, pagos, cupo, cotización del dólar y sorteo de becas. Los cobros todavía se registran a mano: la conexión con Mercado Pago y PayPal es la segunda parte de la fase 4. Las demás secciones se suman por fases (ver "Hoja de ruta").

## Qué podés hacer hoy

- **Hoy**: la pantalla de inicio junta lo que vence según tu rol: pedidos de arrepentimiento y baja por confirmar (24 horas), pedidos de datos pendientes con su plazo, mensajes sin leer y formularios con el plazo de guarda cumplido. Avisa si faltan los feriados del año.
- **Entrar** con email y contraseña. Solo entran las cuentas que figuran en el equipo (`crm_members`). Una cuenta de estudiante o de otra persona queda afuera, aunque use el mismo Supabase.
- **Ver solo lo que permite tu rol**: el menú, las pantallas y los datos dependen de los permisos que la dueña le dio a tu rol en Núcleo. Con "Ver email y teléfono" apagado, esos datos llegan vacíos desde la base.
- **Mensajes**: todo lo que hacía Núcleo → Mensajes. Pestañas por tipo con contador, archivados, notas internas con aviso si quedan sin guardar, responder por email o WhatsApp, plazo de 24 horas de los pedidos, email de confirmación ya redactado, marcar como confirmado y descargar CSV. El menú muestra cuántos mensajes hay sin leer.
- **Personas**: una ficha por email con todo lo que llegó desde el sitio, notas internas, etiquetas, consentimientos, historial, "Descargar sus datos" (para responder un pedido de acceso) y borrado completo.
- **Pedidos de datos** (permiso "Gestionar pedidos de datos"): registrar pedidos de acceso, rectificación o supresión (Ley 25.326) que llegan por email o WhatsApp. La base calcula el vencimiento: 10 días corridos para el acceso y 5 días hábiles para el resto, salteando fines de semana y los feriados cargados en Núcleo. Cada pedido tiene un código `DAT-XXXXXX`, marca de identidad verificada, nota de cierre y aviso si la persona pidió acceso hace menos de seis meses. Si se borra a la persona, el pedido queda como constancia.
- **Consentimientos**: cada casilla que marca alguien en el sitio (privacidad, mayor de 18, publicar su nombre) queda como constancia que no se edita. La ficha muestra el estado actual, el historial y permite registrar que la persona retiró la autorización para publicar su nombre.
- **Retención** (permiso "Borrar datos personales"): lista los formularios que cumplieron el plazo de la Política de privacidad (contacto: 2 años desde el último intercambio; arrepentimiento y baja: 3 años). Nada se borra solo: se eligen y se confirma. Si una persona queda sin formularios, se borra su ficha.
- **Emails**: cada pedido de arrepentimiento o baja deja en cola su email de confirmación con la plantilla guardada. Si sale bien, el pedido queda confirmado solo; si alguien lo confirma a mano antes, el email se cancela. Desde cada ficha se puede escribir un email: la dirección la completa la base, así que no hace falta ver el email de la persona. La pantalla Emails muestra la cola, los enviados, los que fallaron (con el error de Resend) y los cancelados, con "Enviar ahora" y "Cancelar el envío". Todo email queda en la ficha y en "Descargar sus datos".
- **Suscripciones** (permiso "Ver suscripciones"): la suscripción anual (todos los Másteres) y los Másteres sueltos, por estado, con el cupo ocupado. Cada una muestra sus cobros, la cotización usada, los plazos de garantía (15 días desde el alta) y de arrepentimiento (10 días corridos, hasta el siguiente día hábil) y la renovación. Con "Gestionar suscripciones": registrar un alta o una renovación, dar de baja (mantiene el acceso hasta el final del año pagado) y registrar devoluciones. Los montos solo los ve quien tiene "Ver pagos".
- **Pagos** (permiso "Ver pagos" o "Ver reportes"): lo cobrado entre dos fechas, con subtotales por moneda (pesos y dólares por separado, sin convertir). Con "Ver pagos" también cada cobro y el CSV.
- **Sorteo** (permiso "Gestionar el sorteo"): las 3 becas del 50% de las Bases. Numera la lista de espera por orden de inscripción (una vez por persona, solo mayores de 18, anotadas antes de la primera apertura), muestra la huella de la lista, sortea 3 titulares y 3 suplentes con números al azar criptográficos (los repetidos quedan registrados), abre una pantalla con solo números para grabar, manda el aviso por email, lleva los plazos (7 días para responder, 30 para contratar), pasa la beca al suplente y lleva al alta con beca.
- **Configuración** (permiso "Editar la configuración"): abrir y cerrar inscripciones, el cupo de suscripciones anuales (solo cuentan las anuales), la cotización del dólar blue de venta (se lee de dolarhoy.com a las 10:07 y 16:07; se puede cargar a mano), remitente, email para respuestas, confirmación automática sí o no, plantillas con vista previa, revisión de la conexión con Resend y email de prueba.
- **Cierre de sesión automático** después de una hora sin actividad.
- La dueña ve además el link **Administrar en Núcleo**.

## Qué se administra en Núcleo

| Sección de Núcleo | Qué hace |
|---|---|
| CRM → Equipo | Invitar personas, cambiar su rol, reenviar invitaciones, desactivar, reactivar y quitar |
| CRM → Roles y permisos | Crear roles y elegir sus permisos de la lista fija. Los sensibles van marcados |
| CRM → Auditoría | Quién abrió fichas, descargó datos, cobró, sorteó o cambió algo, y cuándo. Nadie la puede editar ni borrar |
| CRM → Feriados | Los días que no cuentan como hábiles para los plazos. Se cargan pegando la lista oficial; al cargar o borrar uno, los plazos pendientes se recalculan |
| CRM → Cupo, dólar y emails | Abre CRM → Configuración. La pantalla vive en el CRM para poder delegarla con el permiso "Editar la configuración" |

La base aplica las mismas reglas: equipo, roles y auditoría solo los lee y cambia la propietaria del CRM, venga el pedido de Núcleo o de cualquier otro lado.

## Cómo está armado

| Pieza | Detalle |
|---|---|
| Interfaz | React 19 + TypeScript + Vite, publicada en Netlify |
| Datos y login | Supabase: proyecto `mryuhzpenzpyhfidwsup` (São Paulo) |
| Seguridad | Políticas RLS en cada tabla del CRM. La interfaz oculta lo que no te corresponde, pero la base es la que bloquea |
| Invitaciones | Edge Function `crm-equipo`, que llama Núcleo |
| Emails | Cola en la base (`crm_emails`) + Edge Function `crm-emails`, que manda con Resend. Un cron de `pg_cron` la despierta cada minuto si hay algo en cola. Las dos funciones son las únicas piezas que usan la `service_role` |
| Emails | Supabase Auth con el SMTP de Resend (ver "Configuración pendiente en Supabase") |

```
ava-crm/
├── index.html
├── netlify.toml               Publicación y seguridad del navegador (CSP)
├── public/                    Logo, íconos y robots.txt
├── src/
│   ├── auth/                  Sesión, permisos de quien entra y cierre por inactividad
│   ├── components/            Menú, ventanas, avisos y protecciones de ruta
│   ├── lib/                   Supabase, consultas, permisos, validaciones y fechas
│   ├── pages/                 Una pantalla por archivo
│   ├── styles/                Tokens de AVA, base y estilos del CRM
│   └── test/                  Configuración de las pruebas
└── supabase/
    ├── migrations/            Cambios de la base, en orden (ya aplicados)
    ├── functions/crm-equipo/  Edge Function de invitaciones
    ├── templates/             Emails de invitación y de contraseña en español
    └── tests/                 Prueba de permisos contra la base real
```

## Trabajar en tu computadora

Necesitás Node 22 o más nuevo.

```bash
npm install
cp .env.example .env.local
npm run dev
```

El CRM abre en `http://localhost:5173`.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta el CRM en modo desarrollo |
| `npm run build` | Revisa los tipos y arma la versión para publicar en `dist/` |
| `npm run test` | Corre las pruebas automáticas |
| `npm run lint` | Revisa el código con ESLint |
| `npm run check` | Tipos, lint y pruebas juntos. Correlo antes de cada commit |

## Publicar en Netlify

1. En Netlify, **Add new site → Import an existing project** y elegí el repo `margintrainingsystems/ava-crm`.
2. Netlify lee `netlify.toml`: comando `npm run build`, carpeta `dist`, Node 22. No cambies nada.
3. En **Site configuration → Site details → Change site name**, poné `ava-crm`. La dirección queda `https://ava-crm.netlify.app`.
4. Cada push a `main` publica una versión nueva.

Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` están en `.env.production`. Son públicas por diseño, igual que en el sitio: la seguridad depende de RLS, nunca de esconder esas claves. La `service_role` jamás va en este repo ni en Netlify.

Si el nombre `ava-crm` está ocupado o cambiás de dominio, actualizá la dirección en: las variables `CRM_URL` y `CRM_ALLOWED_ORIGINS` de la Edge Function, las URLs de redirección de Supabase, `NUCLEO_CRM_URL` y las redirecciones de Núcleo, y este README.

## Configuración pendiente en Supabase

Estas opciones se cambian desde el panel de Supabase; las herramientas de Claude no llegan a ellas.

1. **Authentication → Sign In / Providers → "Allow new users to sign up": desactivado.** Las cuentas del equipo se crean por invitación. Las del Campus también se van a crear desde el servidor, después del pago, así que la opción puede quedar apagada para siempre.
2. **Authentication → URL Configuration → Redirect URLs:** agregá `https://ava-crm.netlify.app/definir-contrasena` y `http://localhost:5173/definir-contrasena`.
3. **Authentication → Emails → SMTP Settings:** activá el SMTP propio con Resend. Host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña: una API key de Resend. El remitente tiene que ser de un dominio verificado en Resend (hoy no hay ninguno). Sin este paso, Supabase solo manda emails de prueba a las cuentas de tu organización y las invitaciones no llegan.
4. **Authentication → Emails → Templates:** pegá `supabase/templates/invitacion.html` en "Invite user" y `supabase/templates/recuperar-contrasena.html` en "Reset password". Cada archivo trae el asunto sugerido.
5. **Authentication → Attack Protection → "Prevent use of leaked passwords":** activado. Supabase lo marca como aviso de seguridad.
6. **Edge Functions → crm-equipo → Secrets (opcional):** `CRM_URL=https://ava-crm.netlify.app` y `CRM_ALLOWED_ORIGINS=https://ava-nucleo.netlify.app,https://ava-crm.netlify.app,http://localhost:5173`. Si no las cargás, la función usa esos mismos valores.

## Base de datos

Las tablas del CRM usan el prefijo `crm_` en el schema `public`, así la API las expone sin tocar la configuración del proyecto. Ninguna migración del CRM toca tablas del sitio ni de Núcleo.

| Tabla | Para qué |
|---|---|
| `crm_permissions` | Catálogo fijo de permisos. Solo cambia por migración |
| `crm_roles` | Roles que crea la propietaria |
| `crm_role_permissions` | Qué permisos tiene cada rol |
| `crm_members` | Personas del equipo, con su rol y si están activas. La propietaria es la fila con `is_owner` |
| `crm_audit_log` | Registro de cambios y accesos. Solo lo lee la propietaria (desde Núcleo); nadie lo edita ni lo borra desde la API |
| `crm_people` | Una fila por persona, identificada por su email en minúsculas |
| `crm_person_notes` | Notas internas sobre cada persona |
| `crm_holidays` | Feriados. Los lee el equipo; solo la propietaria los carga (desde Núcleo) |
| `crm_data_requests` | Pedidos de acceso, rectificación y supresión. El vencimiento lo calcula un trigger |
| `crm_email_settings` | Remitente, respuestas, confirmación automática y si Resend está listo (una sola fila) |
| `crm_email_templates` | Plantillas de email con marcadores `{nombre}` y `{codigo}` |
| `crm_emails` | Cola e historial de emails. Se borran con la persona |
| `crm_consents` | Constancias de consentimiento. Se crean solas con cada formulario y no se editan |
| `crm_enrollment_settings` | Inscripciones abiertas o cerradas, cupo de suscripciones anuales y fecha de la primera apertura (corte del sorteo). Una sola fila |
| `crm_fx_rates` | Historial de la cotización del dólar blue de venta: de dolarhoy.com o cargada a mano |
| `crm_subscriptions` | Suscripción anual o Máster suelto de cada persona, con código `SUS-XXXXXX`, año en curso, moneda, medio y renovación |
| `crm_payments` | Cada cobro (alta o renovación), con cotización, beca, plazos de garantía y arrepentimiento y devoluciones. Nunca guarda datos de tarjetas |
| `crm_raffles`, `crm_raffle_entries`, `crm_raffle_draws`, `crm_raffle_picks` | Sorteo de becas: la lista numerada, cada número que salió y las personas sorteadas con su estado |
| `leads.person_id` | Columna nueva y opcional: la completa el trigger `crm_link_lead` en cada formulario. El sitio no la envía y el valor que mande se ignora |

### Cómo se protegen las personas y los mensajes

El equipo no lee `leads`, `crm_people` ni `crm_person_notes` directamente: las tablas del CRM tienen RLS sin políticas y `leads` sigue siendo solo de Núcleo. Todo pasa por funciones (`crm_messages_list`, `crm_person_detail`, `crm_person_update`, etc.) que:

- revisan el permiso de quien llama;
- devuelven email y teléfono vacíos a quien no tiene "Ver email y teléfono";
- muestran los pedidos de arrepentimiento y baja solo con "Gestionar arrepentimiento y baja";
- registran en la auditoría cada ficha abierta, cada exportación, cada confirmación y cada borrado, sin guardar datos personales en el registro.

Supabase muestra un aviso por cada una de esas funciones ("Signed-In Users Can Execute SECURITY DEFINER Function") y otro por las tablas sin políticas. Son intencionales: la prueba de la fase 1 comprueba que cada función bloquea a quien no corresponde.

Funciones:

- `crm_private.crm_is_member()`, `crm_is_owner()` y `crm_has_permission(clave)`: las usan las políticas RLS. Viven fuera de la API.
- `crm_save_role(...)`: guarda un rol y sus permisos en una sola operación, con los permisos de quien la llama.
- `crm_log(...)`: registra un evento en la auditoría (por ejemplo, una exportación). Revisa que quien la llama sea del equipo.
- `crm_admin_find_user(...)` y `crm_admin_users_status(...)`: solo para la Edge Function.
- `crm_private.crm_add_business_days(fecha, n)`, `crm_next_business_day(fecha)` y `crm_missing_holiday_years(desde, hasta)`: días hábiles de Argentina. Cuentan desde el día siguiente y saltean sábados, domingos y `crm_holidays`.
- `crm_today()`: arma la pantalla Hoy con las secciones que permite el rol.
- `crm_data_requests_list()`, `crm_data_request_create(...)`, `crm_data_request_update(...)` y `crm_data_request_close(...)`: pedidos de datos.
- `crm_consent_withdraw(persona, 'publicar_nombre')`: registra el retiro de esa autorización.
- `crm_retention_list()` y `crm_retention_purge(ids)`: formularios vencidos. El borrado vuelve a revisar el vencimiento antes de borrar.

Protecciones de la fila de la propietaria: nadie la puede modificar ni borrar desde el CRM, y nadie puede crear otra propietaria.

### Probar los permisos

Cinco scripts en `supabase/tests/` simulan a la propietaria, a personas del equipo con distintos roles, a una estudiante y a un visitante anónimo:

- `fase0_permisos.sql`: equipo, roles y auditoría (23 reglas).
- `fase1_personas_mensajes.sql`: formularios del sitio, fichas, email oculto, pedidos, edición y borrado (22 reglas).
- `fase2_plazos_consentimientos_retencion.sql`: feriados, días hábiles, pedidos de datos, constancias de consentimiento, retención y Hoy (44 reglas).
- `fase3_emails.sql`: cola, confirmación automática, cancelación al confirmar a mano, reintentos, plantillas, remitente y permisos (40 reglas). No manda emails: simula a la Edge Function.
- `fase4_suscripciones_pagos_sorteo.sql`: lectura de dolarhoy.com, cotización a mano, cupo, altas, renovaciones, bajas, devoluciones, reporte por moneda, avisos de renovación, sorteo completo y permisos (50 reglas). No lee dolarhoy.com ni manda emails.

Terminan con un error a propósito para que Postgres revierta todo. Correlos en el SQL Editor de Supabase y leé el mensaje: tiene que decir `FALLAS: 0`.

### Agregar un permiso nuevo

1. Escribí una migración que inserte la fila en `crm_permissions`.
2. Sumá la clave en `PERMISSION_KEYS` (`src/lib/permissions.ts`). Una prueba automática compara las dos listas.
3. Usá `crm_private.crm_has_permission('clave')` en las políticas RLS de las tablas nuevas.
4. Regenerá `src/lib/database.types.ts` desde Supabase.

## Suscripciones, pagos, cupo y sorteo

- **Precios**: el sitio los muestra en dólares (`pricing_plan` para la suscripción anual y `masters.price` para cada Máster, con el precio de oferta si está activa). En pesos: dólares × dólar blue de venta vigente, redondeado al peso.
- **Cotización**: `pg_cron` pide la página de dolarhoy.com todos los días a las 10:07 y 16:07 (hora de Buenos Aires) con `pg_net` y la procesa cada 5 minutos. No guarda un valor fuera de rango ni uno que salte más de un 25%: queda la última buena y la Configuración lo avisa. Si dolarhoy.com cambia su página, la lectura avisa "No encontramos el dólar blue" y hay que cargarla a mano hasta ajustar `crm_private.crm_fx_parse`.
- **Para el sitio** (sin iniciar sesión): `crm_enrollment_status()` devuelve solo `{abiertas, hay_lugar}`, sin el número del cupo, y `crm_public_prices()` devuelve los precios en dólares y en pesos. Son las dos funciones que Supabase marca como "Public Can Execute SECURITY DEFINER Function": es intencional y no exponen datos personales.
- **Cupo**: cuentan las suscripciones anuales activas o dadas de baja que todavía no terminaron. Los Másteres sueltos no ocupan cupo. Con el cupo lleno, la base rechaza un alta anual nueva; las renovaciones siguen.
- **Tareas diarias** (`crm-suscripciones-diario`, 9:11): vencen las suscripciones que terminaron (las activas, con 3 días de gracia para que llegue el débito) y dejan en cola el aviso de renovación 20 días antes, con el precio fijado en ese momento.
- **Borrado**: una persona con suscripciones o pagos no se puede borrar ni entra en Retención: los registros de cobro se guardan por obligación fiscal.

## Edge Function `crm-equipo`

Acciones: `invitar`, `reenviar` y `estado`. La llama Núcleo desde Equipo y solo responde a la propietaria activa del CRM.

- Verifica la sesión de quien llama con `auth.getUser(token)`. Por eso se publica con `verify_jwt` apagado (`supabase/config.toml`): así funciona igual con las claves nuevas de Supabase.
- El link del email de invitación siempre lleva a `CRM_URL/definir-contrasena`, venga el pedido de donde venga.
- Si el email ya tiene cuenta activa en AVA (por ejemplo, una estudiante), la suma al equipo sin mandar email y la persona entra con su contraseña de siempre. Si la cuenta existe pero nunca se activó, le reenvía el link.
- Si la invitación sale bien pero no puede guardar a la persona en el equipo, borra la cuenta recién creada para no dejar cuentas sueltas.

Para publicarla con la CLI: `supabase functions deploy crm-equipo`.

## Edge Function `crm-emails`

Acciones: `procesar` (la llama el cron con un token que vive en el Vault de Supabase), `estado`, `enviar` y `probar` (las llama el CRM con la sesión de quien usa la pantalla; la base revisa el permiso).

- Manda texto plano con la API de Resend, de a uno y con pausa (el plan inicial de Resend acepta 2 por segundo). Cada envío lleva una clave de idempotencia para no duplicarse.
- Tres intentos por email: a los 5 minutos, a los 30 y después queda "Con error". El cron solo toma lo pendiente de los últimos 7 días; lo más viejo espera un "Enviar ahora".
- Sin clave de Resend o sin remitente no manda nada ni crea emails de prueba: responde qué falta y el cron vuelve a revisar cada 30 minutos.

### Cómo activar los envíos

1. En Resend, verificá el dominio desde el que vas a mandar (registros DNS en Cloudflare).
2. En Resend, creá una clave de API con permiso de envío.
3. En Supabase → Edge Functions → Secrets, creá `RESEND_API_KEY` con esa clave.
4. En CRM → Configuración, cargá el email remitente (del dominio verificado) y, si querés, el email para respuestas.
5. Tocá "Revisar la conexión" y mandate un email de prueba.
6. Antes del primer envío real, sumá a Resend (Estados Unidos) en la Política de privacidad del sitio.

Esto es independiente del SMTP de Supabase Auth (invitaciones y contraseñas), que también se configura con Resend.

## Reglas para seguir construyendo

- Todo texto de la interfaz va en español rioplatense, sin notas de desarrollo visibles.
- Cada tabla nueva lleva RLS. Los datos personales solo los leen los roles con el permiso correspondiente.
- El CRM nunca pide ni guarda datos de tarjetas, documentos de identidad ni datos sensibles.
- No romper los INSERT públicos que hace el sitio en `leads`: no renombrar columnas ni agregar columnas obligatorias sin valor por defecto.
- Cambios de base solo con migraciones nuevas en `supabase/migrations/`.
- Colores: el verde es el principal; los acentos van solo en detalles.
- Correr `npm run check` y las pruebas de `supabase/tests/` antes de subir a `main`.

## Hoja de ruta

| Fase | Entrega |
|---|---|
| 0 | Acceso, equipo, roles, permisos y auditoría (la administración quedó en Núcleo). **Hecha** |
| 1 | Personas y Mensajes: todo lo que hacía Núcleo → Mensajes, con una ficha por persona. **Hecha** |
| 2 | Bandeja "Hoy", pedidos de datos, días hábiles de Argentina, consentimientos y retención de datos. **Hecha** |
| 3 | Emails con Resend: cola, confirmación automática de pedidos, emails desde la ficha y plantillas. **Hecha**, falta activar Resend |
| 4 | Parte 1: suscripciones, pagos registrados a mano, cupo, cotización del dólar blue y sorteo de becas. **Hecha**. Parte 2: cobro con Mercado Pago y PayPal en el sitio, débito automático y avisos de pago (webhooks) |
| 5 | Campus propio (repo aparte) y certificados con verificación por QR |
| 6 | IA, Discord, WhatsApp Business y SYNKA |
