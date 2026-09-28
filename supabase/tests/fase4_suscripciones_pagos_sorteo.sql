-- Prueba de la fase 4 (parte 1): cotización, inscripciones y cupo, suscripciones, pagos, avisos y sorteo.
-- Correla en el SQL Editor de Supabase. Termina con un error a propósito para revertir todo:
-- leé el mensaje, tiene que decir "FALLAS: 0". No lee dolarhoy.com ni manda emails.

do $$
declare
  v_a uuid := gen_random_uuid();   -- sin permisos de esta fase
  v_b uuid := gen_random_uuid();   -- suscripciones: ver, gestionar y ver pagos; personas
  v_c uuid := gen_random_uuid();   -- configuración
  v_d uuid := gen_random_uuid();   -- solo reportes
  v_e uuid := gen_random_uuid();   -- solo ver suscripciones (sin montos)
  v_f uuid := gen_random_uuid();   -- sorteo y ver personas
  v_roles uuid[] := '{}';
  v_role uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid;
  v_pay uuid;
  v_raffle uuid;
  v_pick1 uuid; v_pick2 uuid; v_pick4 uuid;
  v_pick2_person uuid;
  v_n int;
  v_j jsonb;
  v_ok boolean;
  v_txt text;
  v_rate numeric;
  r text := '';
  fallas int := 0;
  i int;
begin
  insert into auth.users (id, email, aud, role)
  select u, 'prueba-' || n || '@example.com', 'authenticated', 'authenticated'
  from unnest(array[v_a, v_b, v_c, v_d, v_e, v_f], array['a', 'b', 'c', 'd', 'e', 'f']) as t(u, n);
  for i in 1..6 loop
    insert into public.crm_roles (name) values ('Prueba ' || i) returning id into v_role;
    v_roles := array_append(v_roles, v_role);
  end loop;
  insert into public.crm_role_permissions values
    (v_roles[1], 'mensajes.ver'),
    (v_roles[2], 'suscripciones.ver'), (v_roles[2], 'suscripciones.gestionar'), (v_roles[2], 'pagos.ver'),
    (v_roles[2], 'personas.ver'), (v_roles[2], 'personas.borrar'),
    (v_roles[3], 'configuracion.editar'),
    (v_roles[4], 'reportes.ver'),
    (v_roles[5], 'suscripciones.ver'),
    (v_roles[6], 'sorteo.gestionar'), (v_roles[6], 'personas.ver');
  insert into public.crm_members (user_id, email, role_id) values
    (v_a, 'prueba-a@example.com', v_roles[1]), (v_b, 'prueba-b@example.com', v_roles[2]),
    (v_c, 'prueba-c@example.com', v_roles[3]), (v_d, 'prueba-d@example.com', v_roles[4]),
    (v_e, 'prueba-e@example.com', v_roles[5]), (v_f, 'prueba-f@example.com', v_roles[6]);

  -- 1. Lector de dolarhoy.com.
  select rate into v_rate from crm_private.crm_fx_parse(
    '<a class="titleText" href="/cotizaciondolarblue">Dólar blue</a><div class="values"><div class="compra"><div class="label">Compra</div><div class="val">$1.545</div></div><div class="venta"><div class="label">Venta</div><div class="val">$1.565,50</div></div></div><div class="tile update"><span>Actualizado por última vez: 28/09/26 03:28 PM</span></div>');
  if v_rate = 1565.50 then r := r || 'lee_blue_venta=ok '; else r := r || 'lee_blue_venta=MAL(' || coalesce(v_rate::text, 'null') || ') '; fallas := fallas + 1; end if;
  select rate into v_rate from crm_private.crm_fx_parse('<html>otra cosa</html>');
  if v_rate is null then r := r || 'sin_blue_no_inventa=ok '; else r := r || 'sin_blue_no_inventa=MAL '; fallas := fallas + 1; end if;

  -- Cotización de base para la prueba: 1000. Un salto de más del 25% no se guarda solo.
  insert into public.crm_fx_rates (rate, source, created_at) values (1000, 'manual', now() + interval '1 second');
  insert into net._http_response (id, status_code, content, created)
  values (-101, 200, '<a class="titleText" href="/cotizaciondolarblue">Dólar blue</a><div class="values"><div class="venta"><div class="label">Venta</div><div class="val">$1.500</div></div>', now()),
         (-103, 200, '<html>rediseño</html>', now());
  insert into crm_private.crm_fx_fetches (request_id) values (-101);
  perform crm_private.crm_fx_process();
  select result = 'salto_grande' into v_ok from crm_private.crm_fx_fetches where request_id = -101;
  if v_ok and crm_private.crm_current_fx() = 1000 then r := r || 'salto_grande_no_se_guarda=ok '; else r := r || 'salto_grande_no_se_guarda=MAL '; fallas := fallas + 1; end if;
  insert into crm_private.crm_fx_fetches (request_id) values (-103);
  perform crm_private.crm_fx_process();
  select result = 'sin_dato' into v_ok from crm_private.crm_fx_fetches where request_id = -103;
  if v_ok then r := r || 'pagina_cambiada_avisa=ok '; else r := r || 'pagina_cambiada_avisa=MAL '; fallas := fallas + 1; end if;

  -- Carga a mano: solo con "Editar la configuración".
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_fx_set_manual(1200, null);
    r := r || 'A.no_carga_cotizacion=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.no_carga_cotizacion=ok ';
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_fx_set_manual(3, null);
    r := r || 'C.cotizacion_absurda=MAL '; fallas := fallas + 1;
  exception when invalid_parameter_value then r := r || 'C.cotizacion_absurda=ok ';
  end;
  execute 'reset role';
  -- La carga manual queda después de la base de prueba.
  update public.crm_fx_rates set created_at = now() - interval '1 second' where rate = 1000 and source = 'manual';
  execute 'set local role authenticated';
  perform public.crm_fx_set_manual(1000, 'Prueba');
  v_j := public.crm_fx_status();
  execute 'reset role';
  if (v_j->>'rate')::numeric = 1000 and v_j->>'source' = 'manual' then r := r || 'C.carga_cotizacion=ok '; else r := r || 'C.carga_cotizacion=MAL '; fallas := fallas + 1; end if;

  -- 2. Inscripciones y cupo (2 lugares para la prueba).
  v_rate := crm_private.crm_price_usd('plan', null) * 1000;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  v_j := public.crm_enrollment_status();
  v_ok := (public.crm_public_prices()->'plan'->>'ars')::numeric = v_rate;
  execute 'reset role';
  if v_j = '{"abiertas": false, "hay_lugar": false}'::jsonb and v_ok then r := r || 'sitio_ve_cerrado_y_precios=ok '; else r := r || 'sitio_ve_cerrado_y_precios=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.crm_enrollment_save(true, 2);
  execute 'reset role';
  -- La apertura es el corte de la lista de espera del sorteo: la ubicamos en el pasado para la prueba.
  update public.crm_enrollment_settings set opened_at = now() - interval '1 day' where id = 1;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  v_j := public.crm_enrollment_status();
  execute 'reset role';
  if v_j = '{"abiertas": true, "hay_lugar": true}'::jsonb then r := r || 'abrir_inscripciones=ok '; else r := r || 'abrir_inscripciones=MAL '; fallas := fallas + 1; end if;

  -- 3. Personas (desde el sitio) y altas.
  insert into public.leads (source, name, last_name, email, privacy_consent, adult_confirmed, created_at) values
    ('contacto', 'Uno', 'Prueba', 'uno.fase4@example.com', true, true, now() - interval '5 days'),
    ('contacto', 'Dos', 'Prueba', 'dos.fase4@example.com', true, true, now() - interval '5 days'),
    ('contacto', 'Tres', 'Prueba', 'tres.fase4@example.com', true, true, now() - interval '5 days');
  select id into v_p1 from public.crm_people where email_normalized = 'uno.fase4@example.com';
  select id into v_p2 from public.crm_people where email_normalized = 'dos.fase4@example.com';
  select id into v_p3 from public.crm_people where email_normalized = 'tres.fase4@example.com';

  perform set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_payment_register(v_p1, 'plan', null, 400000, 'ARS', now());
    r := r || 'E.no_registra=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'E.no_registra=ok ';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_s1 := public.crm_payment_register(v_p1, 'plan', null, 400000, 'ARS', now() - interval '2 days', 'mercadopago', 'MP-1');
  begin
    perform public.crm_payment_register(v_p1, 'plan', null, 400000, 'ARS', now(), 'mercadopago', 'MP-X');
    r := r || 'una_anual_por_persona=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'una_anual_por_persona=ok ';
  end;
  v_s2 := public.crm_payment_register(v_p2, 'plan', null, 400, 'USD', now(), 'paypal', 'PP-1');
  begin
    perform public.crm_payment_register(v_p3, 'plan', null, 400, 'USD', now(), 'paypal', 'PP-2');
    r := r || 'cupo_completo=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'cupo_completo=ok ';
  end;
  v_s3 := public.crm_payment_register(v_p3, 'master', (select id from public.masters order by order_index limit 1), 175, 'USD', now(), 'paypal', 'PP-3');
  begin
    perform public.crm_payment_register(v_p3, 'master', (select id from public.masters order by order_index limit 1), 175, 'USD', now(), 'paypal', 'PP-4');
    r := r || 'mismo_master_dos_veces=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'mismo_master_dos_veces=ok ';
  end;
  begin
    perform public.crm_payment_register(v_p3, 'master', (select id from public.masters order by order_index offset 1 limit 1), 175, 'USD', now(), 'paypal', 'PP-3');
    r := r || 'id_de_pago_unico=MAL '; fallas := fallas + 1;
  exception when unique_violation then r := r || 'id_de_pago_unico=ok ';
  end;
  execute 'reset role';

  select y.fx_rate = 1000 and y.kind = 'alta' and y.usd_list_price = crm_private.crm_price_usd('plan', null)
         and y.guarantee_until = crm_private.crm_local_date(y.paid_at) + (select guarantee_days from public.pricing_plan where id = 1)
         and y.withdrawal_until = crm_private.crm_next_business_day(crm_private.crm_local_date(y.paid_at) + 10)
  into v_ok from public.crm_payments y where y.subscription_id = v_s1;
  if v_ok then r := r || 'alta_con_plazos_y_cotizacion=ok '; else r := r || 'alta_con_plazos_y_cotizacion=MAL '; fallas := fallas + 1; end if;
  select s.current_period_end = s.started_at + interval '1 year' and s.code ~ '^SUS-' into v_ok from public.crm_subscriptions s where s.id = v_s1;
  if v_ok then r := r || 'un_anio=ok '; else r := r || 'un_anio=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  v_j := public.crm_enrollment_status();
  execute 'reset role';
  if v_j = '{"abiertas": true, "hay_lugar": false}'::jsonb then r := r || 'sitio_ve_cupo_lleno=ok '; else r := r || 'sitio_ve_cupo_lleno=MAL '; fallas := fallas + 1; end if;

  -- 4. Renovación, baja y devolución.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.crm_payment_register(null, null, null, 450000, 'ARS', now(), 'mercadopago', 'MP-2', v_s1);
  begin
    perform public.crm_payment_register(null, null, null, 450, 'USD', now(), 'mercadopago', 'MP-3', v_s1);
    r := r || 'renovacion_misma_moneda=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'renovacion_misma_moneda=ok ';
  end;
  perform public.crm_subscription_cancel(v_s2, 'Pidió la baja por el botón');
  execute 'reset role';
  select s.current_period_end = s.started_at + interval '2 years' and s.status = 'activa' into v_ok from public.crm_subscriptions s where s.id = v_s1;
  if v_ok then r := r || 'renovacion_suma_un_anio=ok '; else r := r || 'renovacion_suma_un_anio=MAL '; fallas := fallas + 1; end if;
  select guarantee_until is null into v_ok from public.crm_payments where subscription_id = v_s1 and kind = 'renovacion';
  if v_ok then r := r || 'renovacion_sin_garantia=ok '; else r := r || 'renovacion_sin_garantia=MAL '; fallas := fallas + 1; end if;
  if crm_private.crm_active_plan_count() = 2 then r := r || 'baja_sigue_ocupando_hasta_el_final=ok '; else r := r || 'baja_sigue_ocupando_hasta_el_final=MAL '; fallas := fallas + 1; end if;

  select id into v_pay from public.crm_payments where subscription_id = v_s2;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_payment_refund(v_pay, 500, 'garantia');
    r := r || 'no_devuelve_de_mas=MAL '; fallas := fallas + 1;
  exception when invalid_parameter_value then r := r || 'no_devuelve_de_mas=ok ';
  end;
  perform public.crm_payment_refund(v_pay, 400, 'garantia');
  execute 'reset role';
  select s.status = 'reembolsada' and not s.auto_renew into v_ok from public.crm_subscriptions s where s.id = v_s2;
  if v_ok and crm_private.crm_active_plan_count() = 1 then r := r || 'devolucion_libera_cupo=ok '; else r := r || 'devolucion_libera_cupo=MAL '; fallas := fallas + 1; end if;

  -- 5. Reporte por moneda y quién ve montos.
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select jsonb_object_agg(x.currency, jsonb_build_array(x.payments, x.gross, x.refunded, x.net)) into v_j
  from public.crm_payments_report(crm_private.crm_today_ar() - 30, crm_private.crm_today_ar()) x;
  begin
    perform public.crm_payments_list(crm_private.crm_today_ar() - 30, crm_private.crm_today_ar());
    r := r || 'D.no_ve_detalle=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'D.no_ve_detalle=ok ';
  end;
  execute 'reset role';
  if v_j = '{"ARS": [2, 850000, 0, 850000], "USD": [2, 575, 400, 175]}'::jsonb then r := r || 'reporte_por_moneda=ok '; else r := r || 'reporte_por_moneda=MAL(' || coalesce(v_j::text, 'null') || ') '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_j := public.crm_subscription_detail(v_s1);
  select count(*) into v_n from public.crm_subscriptions_list();
  execute 'reset role';
  if v_j->'payments'->0->'amount' = 'null'::jsonb and v_n >= 3 then r := r || 'E.ve_sin_montos=ok '; else r := r || 'E.ve_sin_montos=MAL '; fallas := fallas + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_subscriptions_list();
    r := r || 'A.sin_suscripciones=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.sin_suscripciones=ok ';
  end;
  begin
    perform public.crm_payments_report(crm_private.crm_today_ar() - 30, crm_private.crm_today_ar());
    r := r || 'A.sin_reporte=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.sin_reporte=ok ';
  end;
  execute 'reset role';

  -- 6. No se borra a quien tiene pagos.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_person_delete(v_p1);
    r := r || 'no_borra_con_pagos=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'no_borra_con_pagos=ok ';
  end;
  execute 'reset role';

  -- 7. Tareas diarias: aviso de renovación con el precio y vencimientos.
  update public.crm_subscriptions set current_period_start = now() - interval '355 days', current_period_end = now() + interval '10 days' where id = v_s1;
  update public.crm_subscriptions set status = 'cancelada', current_period_start = now() - interval '1 year', current_period_end = now() - interval '1 hour' where id = v_s3;
  perform crm_private.crm_subscriptions_daily();
  perform crm_private.crm_subscriptions_daily();
  select count(*) into v_n from public.crm_emails where person_id = v_p1 and kind = 'aviso' and template_key = 'aviso_renovacion';
  select body into v_txt from public.crm_emails where person_id = v_p1 and kind = 'aviso' limit 1;
  if v_n = 1 and v_txt like '%$' || replace(to_char(crm_private.crm_price_usd('plan', null) * 1000, 'FM999,999,999'), ',', '.') || ' (pesos argentinos)%'
     and v_txt like '%débito automático de Mercado Pago%' and v_txt like '%/baja%'
  then r := r || 'aviso_renovacion_una_vez=ok '; else r := r || 'aviso_renovacion_una_vez=MAL '; fallas := fallas + 1; end if;
  select renewal_amount = crm_private.crm_price_usd('plan', null) * 1000 into v_ok from public.crm_subscriptions where id = v_s1;
  if v_ok then r := r || 'precio_de_renovacion_fijado=ok '; else r := r || 'precio_de_renovacion_fijado=MAL '; fallas := fallas + 1; end if;
  select status = 'vencida' into v_ok from public.crm_subscriptions where id = v_s3;
  if v_ok then r := r || 'baja_vence_en_fecha=ok '; else r := r || 'baja_vence_en_fecha=MAL '; fallas := fallas + 1; end if;

  -- 8. Sorteo: lista de espera antes de la apertura, una vez por persona, solo mayores de 18.
  insert into public.leads (source, name, last_name, email, privacy_consent, adult_confirmed, publish_consent, created_at)
  select 'suscripcion', 'Espera' || g, 'Lista', 'espera' || g || '.fase4@example.com', true, true, g % 2 = 0,
         now() - interval '3 days' + g * interval '1 minute'
  from generate_series(1, 8) g;
  insert into public.leads (source, name, email, privacy_consent, adult_confirmed, created_at) values
    ('suscripcion', 'Espera1 otra vez', 'espera1.fase4@example.com', true, true, now() - interval '2 days'),
    ('suscripcion', 'Sin declarar', 'menor.fase4@example.com', true, false, now() - interval '2 days'),
    ('suscripcion', 'Tarde', 'tarde.fase4@example.com', true, true, now());

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_raffle_view();
    r := r || 'A.sin_sorteo=MAL '; fallas := fallas + 1;
  exception when insufficient_privilege then r := r || 'A.sin_sorteo=ok ';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_f, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- Sin apertura no hay corte de la lista: no se puede numerar.
  execute 'reset role';
  update public.crm_enrollment_settings set opened_at = null where id = 1;
  execute 'set local role authenticated';
  begin
    perform public.crm_raffle_prepare(crm_private.crm_today_ar());
    r := r || 'sorteo_sin_apertura=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'sorteo_sin_apertura=ok ';
  end;
  execute 'reset role';
  update public.crm_enrollment_settings set opened_at = now() - interval '1 day' where id = 1;
  execute 'set local role authenticated';
  v_raffle := public.crm_raffle_prepare(crm_private.crm_today_ar());
  begin
    perform public.crm_raffle_prepare(crm_private.crm_today_ar());
    r := r || 'un_sorteo_abierto=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'un_sorteo_abierto=ok ';
  end;
  execute 'reset role';
  select entries_count = 8 and length(entries_digest) = 64 into v_ok from public.crm_raffles where id = v_raffle;
  if v_ok then r := r || 'numera_la_lista=ok '; else r := r || 'numera_la_lista=MAL '; fallas := fallas + 1; end if;
  select bool_and(p.email_normalized = 'espera' || e.number || '.fase4@example.com') into v_ok
  from public.crm_raffle_entries e join public.crm_people p on p.id = e.person_id where e.raffle_id = v_raffle;
  if v_ok then r := r || 'orden_de_inscripcion=ok '; else r := r || 'orden_de_inscripcion=MAL '; fallas := fallas + 1; end if;

  update public.crm_enrollment_settings set enrollments_open = false where id = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_f, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_raffle_draw(v_raffle);
    r := r || 'sorteo_despues_de_abrir=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'sorteo_despues_de_abrir=ok ';
  end;
  execute 'reset role';
  update public.crm_enrollment_settings set enrollments_open = true, capacity = 10 where id = 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_f, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_j := public.crm_raffle_draw(v_raffle);
  execute 'reset role';
  select count(*) = 6 and count(distinct entry_number) = 6
         and count(*) filter (where role = 'titular' and status = 'por_avisar' and position <= 3) = 3
         and count(*) filter (where role = 'suplente' and status = 'en_espera' and position > 3) = 3
         and bool_and(entry_number between 1 and 8)
  into v_ok from public.crm_raffle_picks where raffle_id = v_raffle;
  if v_ok then r := r || 'tres_titulares_tres_suplentes=ok '; else r := r || 'tres_titulares_tres_suplentes=MAL '; fallas := fallas + 1; end if;
  select count(*) filter (where not repeated) = 6 into v_ok from public.crm_raffle_draws where raffle_id = v_raffle;
  if v_ok then r := r || 'registro_de_numeros=ok '; else r := r || 'registro_de_numeros=MAL '; fallas := fallas + 1; end if;

  select id into v_pick1 from public.crm_raffle_picks where raffle_id = v_raffle and position = 1;
  select id, person_id into v_pick2, v_pick2_person from public.crm_raffle_picks where raffle_id = v_raffle and position = 2;
  select id into v_pick4 from public.crm_raffle_picks where raffle_id = v_raffle and position = 4;

  perform set_config('request.jwt.claims', json_build_object('sub', v_f, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.crm_raffle_notify(v_pick1);
  begin
    perform public.crm_raffle_resolve(v_pick1, 'sin_respuesta');
    r := r || 'espera_7_dias=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'espera_7_dias=ok ';
  end;
  perform public.crm_raffle_resolve(v_pick1, 'rechazo');
  begin
    perform public.crm_raffle_resolve(v_pick2, 'acepto');
    r := r || 'acepta_quien_fue_avisada=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'acepta_quien_fue_avisada=ok ';
  end;
  perform public.crm_raffle_notify(v_pick2);
  perform public.crm_raffle_resolve(v_pick2, 'acepto');
  v_j := public.crm_raffle_view();
  execute 'reset role';
  select status = 'por_avisar' into v_ok from public.crm_raffle_picks where id = v_pick4;
  if v_ok then r := r || 'pasa_al_primer_suplente=ok '; else r := r || 'pasa_al_primer_suplente=MAL '; fallas := fallas + 1; end if;
  select respond_by = crm_private.crm_today_ar() + 7 and beca_until = crm_private.crm_today_ar() + 30 into v_ok
  from public.crm_raffle_picks where id = v_pick2;
  if v_ok then r := r || 'plazos_de_la_beca=ok '; else r := r || 'plazos_de_la_beca=MAL '; fallas := fallas + 1; end if;
  select count(*) into v_n from public.crm_emails where kind = 'aviso' and template_key = 'aviso_beca';
  if v_n = 2 then r := r || 'aviso_beca_por_email=ok '; else r := r || 'aviso_beca_por_email=MAL '; fallas := fallas + 1; end if;
  -- Nombre público solo con la casilla de autorización (los números pares la marcaron).
  select bool_and(case when (k->>'number')::int % 2 = 0 then k->>'public_name' like 'Espera%L.' else k->'public_name' = 'null'::jsonb end)
  into v_ok from jsonb_array_elements(v_j->'raffles'->0->'picks') k;
  if v_ok then r := r || 'nombre_publico_con_autorizacion=ok '; else r := r || 'nombre_publico_con_autorizacion=MAL '; fallas := fallas + 1; end if;

  -- La beca se usa una vez, en la suscripción anual.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.crm_payment_register(v_pick2_person, 'plan', null, 200, 'USD', now(), 'paypal', 'PP-B0', null, v_pick1);
    r := r || 'beca_de_otra_persona=MAL '; fallas := fallas + 1;
  exception when check_violation then r := r || 'beca_de_otra_persona=ok ';
  end;
  v_s4 := public.crm_payment_register(v_pick2_person, 'plan', null, 200, 'USD', now(), 'paypal', 'PP-B1', null, v_pick2);
  execute 'reset role';
  select y.beca and k.subscription_id = v_s4 into v_ok
  from public.crm_payments y join public.crm_raffle_picks k on k.id = v_pick2 where y.subscription_id = v_s4;
  if v_ok then r := r || 'alta_con_beca=ok '; else r := r || 'alta_con_beca=MAL '; fallas := fallas + 1; end if;

  -- 9. Azar: siempre entre 1 y n, y salen todos los valores.
  select min(x) = 1 and max(x) = 3 and count(distinct x) = 3 into v_ok
  from (select crm_private.crm_random_int(3) as x from generate_series(1, 300)) t;
  if v_ok then r := r || 'azar_en_rango=ok '; else r := r || 'azar_en_rango=MAL '; fallas := fallas + 1; end if;

  -- 10. Auditoría sin datos personales.
  select count(*) into v_n from public.crm_audit_log
  where action in ('registrar_alta', 'registrar_renovacion', 'dar_de_baja', 'registrar_devolucion', 'editar_inscripciones',
                   'cargar_cotizacion', 'preparar_sorteo', 'sortear_becas', 'avisar_beca', 'resolver_beca')
    and actor_id in (v_b, v_c, v_f);
  if v_n >= 14 and not exists (select 1 from public.crm_audit_log where action like 'registrar_%' and detail::text ilike '%fase4%')
  then r := r || 'auditado=ok '; else r := r || 'auditado=MAL(' || v_n || ') '; fallas := fallas + 1; end if;

  raise exception 'FALLAS: % | %', fallas, r;
end;
$$;
