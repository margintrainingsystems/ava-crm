-- Las descripciones de los permisos de la fase 4 dicen lo que hace cada uno hoy.
update public.crm_permissions set description = 'Registrar altas, renovaciones, bajas y devoluciones.' where key = 'suscripciones.gestionar';
update public.crm_permissions set description = 'Ver los cobros por moneda del período.' where key = 'reportes.ver';
update public.crm_permissions set description = 'Abrir inscripciones, cambiar el cupo, cargar la cotización y editar los emails.' where key = 'configuracion.editar';
