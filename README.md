# CRM de AVA

Panel privado donde el equipo de AVA gestiona personas, mensajes, pedidos legales, suscripciones y el sorteo de becas. Vive aparte de Núcleo, que queda solo para administrar el sitio. Los dos usan el mismo proyecto de Supabase.

Hoy el CRM tiene la **fase 0**: acceso, equipo, roles, permisos y auditoría. Las demás secciones se suman por fases (ver "Hoja de ruta").

## Qué podés hacer hoy

- **Entrar** con email y contraseña. Solo entran las cuentas que figuran en el equipo (`crm_members`). Una cuenta de estudiante o de otra persona queda afuera, aunque use el mismo Supabase.
- **Roles y permisos** (solo la propietaria): creás roles como "Docente" o "Atención a estudiantes" y elegís sus permisos de una lista fija. Los permisos que tocan datos sensibles llevan la marca "Sensible".
- **Equipo** (solo la propietaria): invitás personas por email, cambiás su rol, desactivás o reactivás su acceso y las quitás del equipo.
- **Auditoría** (propietaria y roles con el permiso "Ver la auditoría"): el registro de cada cambio en el equipo y en los roles. Nadie lo puede editar ni borrar.
- **Cierre de sesión automático** después de una hora sin actividad.

## Cómo está armado

| Pieza | Detalle |
|---|---|
| Interfaz | React 19 + TypeScript + Vite, publicada en Netlify |
| Datos y login | Supabase: proyecto `mryuhzpenzpyhfidwsup` (São Paulo) |
| Seguridad | Políticas RLS en cada tabla del CRM. La interfaz oculta lo que no te corresponde, pero la base es la que bloquea |
| Invitaciones | Edge Function `crm-equipo`, la única pieza que usa la `service_role` |
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

Si el nombre `ava-crm` está ocupado o cambiás de dominio, actualizá la dirección en tres lugares: la variable `CRM_ALLOWED_ORIGINS` de la Edge Function, las URLs de redirección de Supabase y este README.

## Configuración pendiente en Supabase

Estas opciones se cambian desde el panel de Supabase; las herramientas de Claude no llegan a ellas.

1. **Authentication → Sign In / Providers → "Allow new users to sign up": desactivado.** Las cuentas del equipo se crean por invitación. Las del Campus también se van a crear desde el servidor, después del pago, así que la opción puede quedar apagada para siempre.
2. **Authentication → URL Configuration → Redirect URLs:** agregá `https://ava-crm.netlify.app/definir-contrasena` y `http://localhost:5173/definir-contrasena`.
3. **Authentication → Emails → SMTP Settings:** activá el SMTP propio con Resend. Host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña: una API key de Resend. El remitente tiene que ser de un dominio verificado en Resend (hoy no hay ninguno). Sin este paso, Supabase solo manda emails de prueba a las cuentas de tu organización y las invitaciones no llegan.
4. **Authentication → Emails → Templates:** pegá `supabase/templates/invitacion.html` en "Invite user" y `supabase/templates/recuperar-contrasena.html` en "Reset password". Cada archivo trae el asunto sugerido.
5. **Authentication → Attack Protection → "Prevent use of leaked passwords":** activado. Supabase lo marca como aviso de seguridad.
6. **Edge Functions → crm-equipo → Secrets (opcional):** `CRM_ALLOWED_ORIGINS=https://ava-crm.netlify.app,http://localhost:5173`. Si no la cargás, la función usa esos mismos valores.

## Base de datos

Las tablas del CRM usan el prefijo `crm_` en el schema `public`, así la API las expone sin tocar la configuración del proyecto. Ninguna migración del CRM toca tablas del sitio ni de Núcleo.

| Tabla | Para qué |
|---|---|
| `crm_permissions` | Catálogo fijo de permisos. Solo cambia por migración |
| `crm_roles` | Roles que crea la propietaria |
| `crm_role_permissions` | Qué permisos tiene cada rol |
| `crm_members` | Personas del equipo, con su rol y si están activas. La propietaria es la fila con `is_owner` |
| `crm_audit_log` | Registro de cambios. Nadie lo edita ni lo borra desde la API |

Funciones:

- `crm_private.crm_is_member()`, `crm_is_owner()` y `crm_has_permission(clave)`: las usan las políticas RLS. Viven fuera de la API.
- `crm_save_role(...)`: guarda un rol y sus permisos en una sola operación, con los permisos de quien la llama.
- `crm_log(...)`: registra un evento en la auditoría (por ejemplo, una exportación). Revisa que quien la llama sea del equipo.
- `crm_admin_find_user(...)` y `crm_admin_users_status(...)`: solo para la Edge Function.

Protecciones de la fila de la propietaria: nadie la puede modificar ni borrar desde el CRM, y nadie puede crear otra propietaria.

### Probar los permisos

`supabase/tests/fase0_permisos.sql` crea cuentas de prueba, simula a la propietaria, a una persona del equipo, a una estudiante y a un visitante anónimo, y revisa 23 reglas. Termina con un error a propósito para que Postgres revierta todo. Correlo en el SQL Editor de Supabase y leé el mensaje: tiene que decir `FALLAS: 0`.

### Agregar un permiso nuevo

1. Escribí una migración que inserte la fila en `crm_permissions`.
2. Sumá la clave en `PERMISSION_KEYS` (`src/lib/permissions.ts`). Una prueba automática compara las dos listas.
3. Usá `crm_private.crm_has_permission('clave')` en las políticas RLS de las tablas nuevas.
4. Regenerá `src/lib/database.types.ts` desde Supabase.

## Edge Function `crm-equipo`

Acciones: `invitar`, `reenviar` y `estado`. Solo responde a la propietaria activa del CRM.

- Verifica la sesión de quien llama con `auth.getUser(token)`. Por eso se publica con `verify_jwt` apagado (`supabase/config.toml`): así funciona igual con las claves nuevas de Supabase.
- Si el email ya tiene cuenta activa en AVA (por ejemplo, una estudiante), la suma al equipo sin mandar email y la persona entra con su contraseña de siempre.
- Si la invitación sale bien pero no puede guardar a la persona en el equipo, borra la cuenta recién creada para no dejar cuentas sueltas.

Para publicarla con la CLI: `supabase functions deploy crm-equipo`.

## Reglas para seguir construyendo

- Todo texto de la interfaz va en español rioplatense, sin notas de desarrollo visibles.
- Cada tabla nueva lleva RLS. Los datos personales solo los leen los roles con el permiso correspondiente.
- El CRM nunca pide ni guarda datos de tarjetas, documentos de identidad ni datos sensibles.
- No romper los INSERT públicos que hace el sitio en `leads`: no renombrar columnas ni agregar columnas obligatorias sin valor por defecto.
- Cambios de base solo con migraciones nuevas en `supabase/migrations/`.
- Colores: el verde es el principal; los acentos van solo en detalles.
- Correr `npm run check` y la prueba de permisos antes de subir a `main`.

## Hoja de ruta

| Fase | Entrega |
|---|---|
| 0 | Acceso, equipo, roles, permisos y auditoría. **Hecha** |
| 1 | Personas y Mensajes: todo lo que hoy hace Núcleo → Mensajes, con una ficha por persona |
| 2 | Bandeja "Hoy", pedidos legales, días hábiles de Argentina, consentimientos y retención de datos |
| 3 | Emails automáticos con Resend, empezando por la confirmación de pedidos en 24 horas |
| 4 | Pagos con Mercado Pago y PayPal, suscripciones, cupo y sorteo de becas |
| 5 | Campus propio (repo aparte) y certificados con verificación por QR |
| 6 | IA, Discord, WhatsApp Business y SYNKA |
