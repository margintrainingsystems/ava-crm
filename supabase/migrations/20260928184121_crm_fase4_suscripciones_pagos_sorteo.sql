-- CRM de AVA · Fase 4 (parte 1): inscripciones, cupo, cotización, suscripciones, pagos y sorteo.
--
-- Qué se vende (definido por la dueña):
--   · Suscripción anual con todos los Másteres (precio en pricing_plan).
--   · Cada Máster por separado, también anual (precio en masters.price).
--   Las dos se renuevan solas con el mismo medio de pago (débito automático).
-- Cupo: solo cuentan las suscripciones anuales vigentes. Con el cupo lleno se cierra el pago
--   y el sitio muestra la lista de espera. El número es interno: el sitio solo sabe si hay lugar.
-- Precio en pesos: dólar blue (venta) de dolarhoy.com. La base lo lee dos veces por día; si no
--   puede, avisa y sigue la última cotización hasta que se cargue una a mano.
-- Plazos (Términos del sitio): garantía de 15 días corridos desde el primer pago; arrepentimiento
--   de 10 días corridos desde cada cobro, hasta el día hábil siguiente si el último no es hábil;
--   aviso de renovación al menos 15 días antes, con el precio que se va a cobrar.
-- Sorteo (Bases en los Términos): 3 becas del 50% del precio de lanzamiento del primer año,
--   3 suplentes en orden, 7 días para responder y 30 para contratar.
-- Esta parte no conecta Mercado Pago ni PayPal: eso llega con las credenciales (parte 2).
-- Mientras tanto, el equipo puede registrar altas, renovaciones y devoluciones a mano.

-- ---------------------------------------------------------------------------
-- Inscripciones y cupo
-- ---------------------------------------------------------------------------
create table public.crm_enrollment_settings (
  id integer primary key default 1 check (id = 1),
  enrollments_open boolean not null default false,
  capacity integer not null default 60 check (capacity between 1 and 100000),
  opened_at timestamptz,
  site_url text not null default 'https://aprendeconava.com' check (site_url ~ '^https://[^\s/]+$'),
  updated_at timestamptz not null default now(),
  updated_by_email text
);
insert into public.crm_enrollment_settings (id) values (1);

alter table public.crm_enrollment_settings enable row level security;
revoke all on public.crm_enrollment_settings from anon, authenticated;
grant select on public.crm_enrollment_settings to authenticated;
create policy crm_enrollment_settings_select on public.crm_enrollment_settings
  for select to authenticated using ((select crm_private.crm_is_member()));
create trigger set_updated_at before update on public.crm_enrollment_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cotización del dólar blue
-- ---------------------------------------------------------------------------
create table public.crm_fx_rates (
  id bigint generated always as identity primary key,
  rate numeric(14, 2) not null check (rate > 0),
  source text not null check (source in ('dolarhoy.com', 'manual')),
  source_updated_text text check (char_length(coalesce(source_updated_text, '')) <= 60),
  note text check (char_length(coalesce(note, '')) <= 300),
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_by_email text,
  created_at timestamptz not null default now()
);
create index crm_fx_rates_created_idx on public.crm_fx_rates (created_at desc);
create index crm_fx_rates_recorded_by_idx on public.crm_fx_rates (recorded_by);

alter table public.crm_fx_rates enable row level security;
revoke all on public.crm_fx_rates from anon, authenticated;
grant select on public.crm_fx_rates to authenticated;
create policy crm_fx_rates_select on public.crm_fx_rates
  for select to authenticated using ((select crm_private.crm_is_member()));

-- Cada lectura de dolarhoy.com: el pedido sale con pg_net y se procesa unos minutos después.
create table crm_private.crm_fx_fetches (
  request_id bigint primary key,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  result text check (result in ('ok', 'sin_respuesta', 'sin_dato', 'fuera_de_rango', 'salto_grande')),
  detail text
);
revoke all on crm_private.crm_fx_fetches from public, anon, authenticated;

create function crm_private.crm_fx_request()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  v_id := net.http_get(
    url := 'https://dolarhoy.com/',
    headers := jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; AVA-CRM)'),
    timeout_milliseconds := 20000
  );
  insert into crm_private.crm_fx_fetches (request_id) values (v_id);
end;
$$;

-- Lee el dólar blue (venta) de la página. Si el valor no aparece, es absurdo o salta más de
-- un 25% contra el último, no se guarda y queda el aviso para cargarlo a mano.
create function crm_private.crm_fx_parse(p_html text)
returns table (rate numeric, updated_text text)
language plpgsql immutable set search_path = ''
as $$
declare
  v_raw text;
begin
  v_raw := (regexp_match(p_html,
    'href="/cotizaciondolarblue">Dólar blue</a><div class="values">.*?<div class="venta"><div class="label">Venta</div><div class="val">\$([0-9.,]+)</div>'))[1];
  updated_text := (regexp_match(p_html,
    'href="/cotizaciondolarblue">Dólar blue</a><div class="values">.*?Actualizado por última vez: ([0-9/]+ [0-9:]+ [AP]M)'))[1];
  if v_raw is null then
    rate := null;
  else
    -- Formato argentino: 1.565 o 1.565,50
    rate := replace(replace(v_raw, '.', ''), ',', '.')::numeric;
  end if;
  return next;
end;
$$;

create function crm_private.crm_fx_process()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  f record;
  v_resp record;
  v_parsed record;
  v_last numeric;
begin
  for f in select * from crm_private.crm_fx_fetches where processed_at is null order by request_id loop
    select r.status_code, r.content, r.error_msg, r.timed_out into v_resp from net._http_response r where r.id = f.request_id;
    if not found then
      -- Todavía no respondió. A la media hora se da por perdida.
      if f.requested_at < now() - interval '30 minutes' then
        update crm_private.crm_fx_fetches set processed_at = now(), result = 'sin_respuesta' where request_id = f.request_id;
      end if;
      continue;
    end if;
    if v_resp.status_code is distinct from 200 or v_resp.content is null then
      update crm_private.crm_fx_fetches set processed_at = now(), result = 'sin_respuesta',
        detail = left(coalesce(v_resp.error_msg, 'HTTP ' || v_resp.status_code::text), 300)
      where request_id = f.request_id;
      continue;
    end if;
    select * into v_parsed from crm_private.crm_fx_parse(v_resp.content);
    if v_parsed.rate is null then
      update crm_private.crm_fx_fetches set processed_at = now(), result = 'sin_dato',
        detail = 'No encontramos el dólar blue en la página: puede que dolarhoy.com haya cambiado su diseño.'
      where request_id = f.request_id;
      continue;
    end if;
    if v_parsed.rate < 50 or v_parsed.rate > 1000000 then
      update crm_private.crm_fx_fetches set processed_at = now(), result = 'fuera_de_rango', detail = v_parsed.rate::text
      where request_id = f.request_id;
      continue;
    end if;
    select x.rate into v_last from public.crm_fx_rates x order by x.created_at desc, x.id desc limit 1;
    if v_last is not null and abs(v_parsed.rate - v_last) / v_last > 0.25 then
      update crm_private.crm_fx_fetches set processed_at = now(), result = 'salto_grande',
        detail = format('Leímos %s y la última era %s: confirmalo a mano.', v_parsed.rate, v_last)
      where request_id = f.request_id;
      continue;
    end if;
    if v_last is distinct from v_parsed.rate then
      insert into public.crm_fx_rates (rate, source, source_updated_text) values (v_parsed.rate, 'dolarhoy.com', v_parsed.updated_text);
    end if;
    update crm_private.crm_fx_fetches set processed_at = now(), result = 'ok', detail = v_parsed.rate::text
    where request_id = f.request_id;
  end loop;
end;
$$;

revoke execute on function crm_private.crm_fx_request(), crm_private.crm_fx_parse(text), crm_private.crm_fx_process()
from public, anon, authenticated;

-- 10:07 y 16:07 de Buenos Aires (13:07 y 19:07 UTC). Se procesa cada 5 minutos.
select cron.schedule('crm-cotizacion-leer', '7 13,19 * * *', 'select crm_private.crm_fx_request()');
select cron.schedule('crm-cotizacion-procesar', '*/5 * * * *', 'select crm_private.crm_fx_process()');

create function public.crm_fx_status()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_rate public.crm_fx_rates;
  v_fetch crm_private.crm_fx_fetches;
begin
  perform crm_private.crm_require(crm_private.crm_is_member());
  select * into v_rate from public.crm_fx_rates order by created_at desc, id desc limit 1;
  select * into v_fetch from crm_private.crm_fx_fetches where processed_at is not null order by request_id desc limit 1;
  return jsonb_build_object(
    'rate', v_rate.rate,
    'source', v_rate.source,
    'source_updated_text', v_rate.source_updated_text,
    'recorded_at', v_rate.created_at,
    'recorded_by_email', v_rate.recorded_by_email,
    -- dolarhoy.com no actualiza los fines de semana: vieja es de hace más de 4 días.
    'stale', v_rate.created_at is null or v_rate.created_at < now() - interval '4 days',
    'last_check_at', v_fetch.processed_at,
    'last_check_result', v_fetch.result,
    'last_check_detail', v_fetch.detail,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('rate', h.rate, 'source', h.source, 'at', h.created_at, 'by', h.recorded_by_email, 'note', h.note)
        order by h.created_at desc)
      from (select * from public.crm_fx_rates order by created_at desc, id desc limit 10) h
    ), '[]'::jsonb)
  );
end;
$$;

create function public.crm_fx_set_manual(p_rate numeric, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('configuracion.editar'));
  if p_rate is null or p_rate < 50 or p_rate > 1000000 then
    raise exception 'Revisá la cotización: tiene que ser el precio en pesos de un dólar' using errcode = '22023';
  end if;
  insert into public.crm_fx_rates (rate, source, note, recorded_by, recorded_by_email)
  select round(p_rate, 2), 'manual', nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), m.email
  from public.crm_members m where m.user_id = auth.uid();
  perform crm_private.crm_audit('cargar_cotizacion', 'crm_fx_rates', null, jsonb_build_object('cotizacion', round(p_rate, 2)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Precios
-- ---------------------------------------------------------------------------
create function crm_private.crm_price_usd(p_kind text, p_master_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $$
  select case
    when p_kind = 'plan' then (select case when p.show_promo then p.price_promo else p.price_regular end from public.pricing_plan p where p.id = 1)
    when p_kind = 'master' then (select m.price from public.masters m where m.id = p_master_id)
  end::numeric
$$;

create function crm_private.crm_current_fx()
returns numeric language sql stable security definer set search_path = ''
as $$ select x.rate from public.crm_fx_rates x order by x.created_at desc, x.id desc limit 1 $$;

-- Pesos redondeados al entero, como se cobran.
create function crm_private.crm_to_ars(p_usd numeric)
returns numeric language sql stable security definer set search_path = ''
as $$ select round(p_usd * crm_private.crm_current_fx(), 0) $$;

revoke execute on function crm_private.crm_price_usd(text, uuid), crm_private.crm_current_fx(), crm_private.crm_to_ars(numeric)
from public, anon;
grant execute on function crm_private.crm_price_usd(text, uuid), crm_private.crm_current_fx(), crm_private.crm_to_ars(numeric)
to authenticated;

-- ---------------------------------------------------------------------------
-- Suscripciones y pagos
-- ---------------------------------------------------------------------------
create table public.crm_subscriptions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  -- Una persona con pagos no se borra desde la ficha: hay que resolverlo antes.
  person_id uuid not null references public.crm_people (id) on delete restrict,
  kind text not null check (kind in ('plan', 'master')),
  master_id uuid references public.masters (id) on delete restrict,
  status text not null default 'activa' check (status in ('activa', 'cancelada', 'vencida', 'reembolsada')),
  provider text not null check (provider in ('mercadopago', 'paypal', 'manual')),
  provider_ref text check (char_length(coalesce(provider_ref, '')) <= 200),
  currency text not null check (currency in ('ARS', 'USD')),
  started_at timestamptz not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  auto_renew boolean not null default true,
  cancel_requested_at timestamptz,
  ended_at timestamptz,
  renewal_amount numeric(14, 2),
  renewal_notice_for date,
  beca_pick_id uuid,
  notes text check (char_length(coalesce(notes, '')) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'master') = (master_id is not null)),
  check (current_period_end > current_period_start)
);
create index crm_subscriptions_person_idx on public.crm_subscriptions (person_id);
create index crm_subscriptions_master_idx on public.crm_subscriptions (master_id);
create index crm_subscriptions_period_idx on public.crm_subscriptions (current_period_end) where status in ('activa', 'cancelada');
create index crm_subscriptions_created_by_idx on public.crm_subscriptions (created_by);
create unique index crm_subscriptions_provider_ref_idx on public.crm_subscriptions (provider, provider_ref) where provider_ref is not null;

create table public.crm_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.crm_subscriptions (id) on delete restrict,
  person_id uuid not null references public.crm_people (id) on delete restrict,
  kind text not null check (kind in ('alta', 'renovacion')),
  provider text not null check (provider in ('mercadopago', 'paypal', 'manual')),
  provider_payment_id text check (char_length(coalesce(provider_payment_id, '')) <= 200),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency in ('ARS', 'USD')),
  usd_list_price numeric(14, 2),
  fx_rate numeric(14, 2),
  beca boolean not null default false,
  status text not null default 'aprobado' check (status in ('aprobado', 'reembolsado', 'reembolso_parcial')),
  paid_at timestamptz not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  guarantee_until date,
  withdrawal_until date not null,
  refunded_amount numeric(14, 2) not null default 0 check (refunded_amount >= 0),
  refunded_at timestamptz,
  refund_reason text check (refund_reason in ('garantia', 'arrepentimiento', 'baja_de_master', 'menor_de_edad', 'otro')),
  refund_note text check (char_length(coalesce(refund_note, '')) <= 1000),
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_by_email text,
  created_at timestamptz not null default now(),
  check (refunded_amount <= amount),
  check ((currency = 'ARS') = (fx_rate is not null) or provider = 'manual')
);
create index crm_payments_subscription_idx on public.crm_payments (subscription_id, paid_at desc);
create index crm_payments_person_idx on public.crm_payments (person_id);
create index crm_payments_paid_idx on public.crm_payments (paid_at desc);
create index crm_payments_recorded_by_idx on public.crm_payments (recorded_by);
create unique index crm_payments_provider_id_idx on public.crm_payments (provider, provider_payment_id) where provider_payment_id is not null;

alter table public.crm_subscriptions enable row level security;
alter table public.crm_payments enable row level security;
revoke all on public.crm_subscriptions, public.crm_payments from anon, authenticated;

create trigger set_updated_at before update on public.crm_subscriptions
  for each row execute function public.set_updated_at();

-- Suscripciones anuales vigentes: las que ocupan cupo.
create function crm_private.crm_active_plan_count()
returns integer language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.crm_subscriptions s
  where s.kind = 'plan' and s.status in ('activa', 'cancelada') and s.current_period_end > now()
$$;
revoke execute on function crm_private.crm_active_plan_count() from public, anon;
grant execute on function crm_private.crm_active_plan_count() to authenticated;

-- Para el sitio: si se puede pagar. No expone el número del cupo.
create function public.crm_enrollment_status()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'abiertas', s.enrollments_open,
    'hay_lugar', s.enrollments_open and crm_private.crm_active_plan_count() < s.capacity
  )
  from public.crm_enrollment_settings s where s.id = 1
$$;
revoke execute on function public.crm_enrollment_status() from public;
grant execute on function public.crm_enrollment_status() to anon, authenticated;

-- Para el sitio: precios en dólares y en pesos con la cotización del día.
create function public.crm_public_prices()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'cotizacion', crm_private.crm_current_fx(),
    'cotizacion_fecha', (select x.created_at from public.crm_fx_rates x order by x.created_at desc, x.id desc limit 1),
    'plan', jsonb_build_object('usd', crm_private.crm_price_usd('plan', null), 'ars', crm_private.crm_to_ars(crm_private.crm_price_usd('plan', null))),
    'masters', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.name, 'usd', m.price, 'ars', crm_private.crm_to_ars(m.price)) order by m.order_index)
      from public.masters m
    ), '[]'::jsonb)
  )
$$;
revoke execute on function public.crm_public_prices() from public;
grant execute on function public.crm_public_prices() to anon, authenticated;

create function crm_private.crm_product_name(p_kind text, p_master_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select case when p_kind = 'plan' then 'Suscripción anual (todos los Másteres)'
    else 'Máster ' || coalesce((select m.name from public.masters m where m.id = p_master_id), 'sin nombre') end
$$;
revoke execute on function crm_private.crm_product_name(text, uuid) from public, anon;
grant execute on function crm_private.crm_product_name(text, uuid) to authenticated;

-- Plazos de cada cobro, según los Términos.
create function crm_private.crm_payment_deadlines(p_paid_at timestamptz, p_first boolean)
returns table (guarantee_until date, withdrawal_until date)
language sql stable security definer set search_path = ''
as $$
  select
    case when p_first then crm_private.crm_local_date(p_paid_at)
      + (select p.guarantee_days from public.pricing_plan p where p.id = 1) end,
    crm_private.crm_next_business_day(crm_private.crm_local_date(p_paid_at) + 10)
$$;
revoke execute on function crm_private.crm_payment_deadlines(timestamptz, boolean) from public, anon, authenticated;

-- Registra un cobro. La usan el registro manual y, en la parte 2, los avisos de Mercado Pago y PayPal.
-- Alta: crea la suscripción (revisa el cupo si es anual). Renovación: suma un año.
create function crm_private.crm_record_payment(
  p_subscription_id uuid, p_person_id uuid, p_kind text, p_master_id uuid,
  p_provider text, p_provider_ref text, p_provider_payment_id text,
  p_amount numeric, p_currency text, p_paid_at timestamptz, p_beca_pick_id uuid,
  p_actor uuid, p_actor_email text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_sub public.crm_subscriptions;
  v_first boolean := p_subscription_id is null;
  v_period_start timestamptz;
  v_deadlines record;
  v_capacity integer;
  v_code text;
  v_payment uuid;
  v_fx numeric := case when p_currency = 'ARS' then crm_private.crm_current_fx() end;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Revisá el monto' using errcode = '22023';
  end if;
  if p_paid_at is null or p_paid_at > now() + interval '5 minutes' then
    raise exception 'La fecha del cobro no puede ser futura' using errcode = '22023';
  end if;
  if p_currency = 'ARS' and v_fx is null and p_provider <> 'manual' then
    raise exception 'No hay cotización cargada para registrar un cobro en pesos' using errcode = '23514';
  end if;

  if v_first then
    if not exists (select 1 from public.crm_people where id = p_person_id) then
      raise exception 'La persona no existe' using errcode = 'P0002';
    end if;
    if p_kind = 'plan' then
      select s.capacity into v_capacity from public.crm_enrollment_settings s where s.id = 1;
      if crm_private.crm_active_plan_count() >= v_capacity then
        raise exception 'El cupo está completo: no se pueden sumar suscripciones anuales' using errcode = '23514';
      end if;
      if exists (select 1 from public.crm_subscriptions s where s.person_id = p_person_id and s.kind = 'plan'
                 and s.status in ('activa', 'cancelada') and s.current_period_end > now()) then
        raise exception 'Esta persona ya tiene una suscripción anual vigente' using errcode = '23514';
      end if;
    elsif p_kind = 'master' then
      if not exists (select 1 from public.masters where id = p_master_id) then
        raise exception 'El Máster no existe' using errcode = 'P0002';
      end if;
      if exists (select 1 from public.crm_subscriptions s where s.person_id = p_person_id and s.kind = 'master'
                 and s.master_id = p_master_id and s.status in ('activa', 'cancelada') and s.current_period_end > now()) then
        raise exception 'Esta persona ya tiene ese Máster vigente' using errcode = '23514';
      end if;
    else
      raise exception 'Producto inválido' using errcode = '23514';
    end if;
    if p_beca_pick_id is not null then
      if p_kind <> 'plan' then
        raise exception 'La beca es para la suscripción anual' using errcode = '23514';
      end if;
      if not exists (select 1 from public.crm_raffle_picks k where k.id = p_beca_pick_id and k.person_id = p_person_id
                     and k.status = 'acepto' and k.subscription_id is null and k.beca_until >= crm_private.crm_today_ar()) then
        raise exception 'La beca no está disponible para esta persona (tiene que haberla aceptado y estar dentro de los 30 días)' using errcode = '23514';
      end if;
    end if;

    loop
      v_code := crm_private.crm_new_code('SUS');
      exit when not exists (select 1 from public.crm_subscriptions where code = v_code);
    end loop;
    insert into public.crm_subscriptions (
      code, person_id, kind, master_id, provider, provider_ref, currency, started_at,
      current_period_start, current_period_end, beca_pick_id, created_by, created_by_email
    ) values (
      v_code, p_person_id, p_kind, case when p_kind = 'master' then p_master_id end, p_provider,
      nullif(btrim(coalesce(p_provider_ref, '')), ''), p_currency, p_paid_at,
      p_paid_at, p_paid_at + interval '1 year', p_beca_pick_id, p_actor, p_actor_email
    ) returning * into v_sub;
    if p_beca_pick_id is not null then
      update public.crm_raffle_picks set subscription_id = v_sub.id where id = p_beca_pick_id;
    end if;
    v_period_start := p_paid_at;
  else
    select * into v_sub from public.crm_subscriptions where id = p_subscription_id for update;
    if not found then
      raise exception 'La suscripción no existe' using errcode = 'P0002';
    end if;
    if v_sub.status = 'reembolsada' then
      raise exception 'La suscripción está reembolsada: registrá un alta nueva' using errcode = '23514';
    end if;
    if p_currency <> v_sub.currency then
      raise exception 'La renovación tiene que ser en la misma moneda que la suscripción (%)', v_sub.currency using errcode = '23514';
    end if;
    -- El año nuevo arranca donde terminaba el anterior, o hoy si ya había vencido.
    v_period_start := greatest(v_sub.current_period_end, p_paid_at);
    update public.crm_subscriptions set
      status = 'activa', current_period_start = v_period_start, current_period_end = v_period_start + interval '1 year',
      auto_renew = true, cancel_requested_at = null, ended_at = null, renewal_amount = null
    where id = v_sub.id;
  end if;

  select * into v_deadlines from crm_private.crm_payment_deadlines(p_paid_at, v_first);
  insert into public.crm_payments (
    subscription_id, person_id, kind, provider, provider_payment_id, amount, currency, usd_list_price, fx_rate, beca,
    paid_at, period_start, period_end, guarantee_until, withdrawal_until, recorded_by, recorded_by_email
  ) values (
    v_sub.id, v_sub.person_id, case when v_first then 'alta' else 'renovacion' end, p_provider,
    nullif(btrim(coalesce(p_provider_payment_id, '')), ''), round(p_amount, 2), p_currency,
    crm_private.crm_price_usd(v_sub.kind, v_sub.master_id), v_fx, v_first and p_beca_pick_id is not null,
    p_paid_at, v_period_start, v_period_start + interval '1 year', v_deadlines.guarantee_until, v_deadlines.withdrawal_until,
    p_actor, p_actor_email
  ) returning id into v_payment;

  update public.crm_people set last_activity_at = greatest(last_activity_at, p_paid_at) where id = v_sub.person_id;
  return v_payment;
end;
$$;
revoke execute on function crm_private.crm_record_payment(uuid, uuid, text, uuid, text, text, text, numeric, text, timestamptz, uuid, uuid, text)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sorteo de becas
-- ---------------------------------------------------------------------------
create table public.crm_raffles (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'preparado' check (status in ('preparado', 'sorteado', 'cerrado')),
  scheduled_for date,
  winners integer not null default 3 check (winners between 1 and 20),
  substitutes integer not null default 3 check (substitutes between 0 and 20),
  discount_percent integer not null default 50 check (discount_percent between 1 and 100),
  entries_count integer not null default 0,
  entries_digest text,
  created_by_email text,
  created_at timestamptz not null default now(),
  drawn_at timestamptz,
  drawn_by_email text,
  closed_at timestamptz
);
-- Un solo sorteo abierto a la vez.
create unique index crm_raffles_one_open_idx on public.crm_raffles ((true)) where status <> 'cerrado';

create table public.crm_raffle_entries (
  raffle_id uuid not null references public.crm_raffles (id) on delete cascade,
  number integer not null check (number > 0),
  person_id uuid references public.crm_people (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  signed_up_at timestamptz not null,
  primary key (raffle_id, number)
);
create index crm_raffle_entries_person_idx on public.crm_raffle_entries (person_id);
create index crm_raffle_entries_lead_idx on public.crm_raffle_entries (lead_id);

-- Cada número que salió, también los repetidos: así el sorteo se puede reconstruir.
create table public.crm_raffle_draws (
  raffle_id uuid not null references public.crm_raffles (id) on delete cascade,
  attempt integer not null,
  number integer not null,
  repeated boolean not null,
  primary key (raffle_id, attempt)
);

create table public.crm_raffle_picks (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.crm_raffles (id) on delete cascade,
  position integer not null check (position > 0),
  role text not null check (role in ('titular', 'suplente')),
  entry_number integer not null,
  person_id uuid references public.crm_people (id) on delete set null,
  status text not null check (status in ('por_avisar', 'en_espera', 'avisada', 'acepto', 'rechazo', 'sin_respuesta')),
  notified_at timestamptz,
  respond_by date,
  beca_until date,
  resolved_at timestamptz,
  subscription_id uuid references public.crm_subscriptions (id) on delete set null,
  unique (raffle_id, position),
  unique (raffle_id, entry_number)
);
create index crm_raffle_picks_person_idx on public.crm_raffle_picks (person_id);
create index crm_raffle_picks_subscription_idx on public.crm_raffle_picks (subscription_id);

alter table public.crm_subscriptions
  add constraint crm_subscriptions_beca_pick_fk foreign key (beca_pick_id) references public.crm_raffle_picks (id) on delete set null;
create index crm_subscriptions_beca_pick_idx on public.crm_subscriptions (beca_pick_id);

alter table public.crm_raffles enable row level security;
alter table public.crm_raffle_entries enable row level security;
alter table public.crm_raffle_draws enable row level security;
alter table public.crm_raffle_picks enable row level security;
revoke all on public.crm_raffles, public.crm_raffle_entries, public.crm_raffle_draws, public.crm_raffle_picks from anon, authenticated;

-- Número al azar entre 1 y n con bytes criptográficos, sin sesgo (se descartan los valores del final).
create function crm_private.crm_random_int(p_n integer)
returns integer language plpgsql volatile set search_path = ''
as $$
declare
  v_limit bigint := 4294967296 - (4294967296 % p_n);
  v_value bigint;
begin
  loop
    -- 4 bytes al azar, leídos como número sin signo.
    v_value := ('x' || lpad(encode(extensions.gen_random_bytes(4), 'hex'), 16, '0'))::bit(64)::bigint;
    exit when v_value < v_limit;
  end loop;
  return (v_value % p_n)::integer + 1;
end;
$$;
revoke execute on function crm_private.crm_random_int(integer) from public, anon, authenticated;

-- Prepara el sorteo: numera la lista de espera por orden de inscripción, una vez por persona,
-- solo mayores de 18 que se anotaron antes de la apertura.
create function public.crm_raffle_prepare(p_scheduled_for date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_cutoff timestamptz := coalesce((select s.opened_at from public.crm_enrollment_settings s where s.id = 1), now());
  v_count integer;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('sorteo.gestionar'));
  if exists (select 1 from public.crm_raffles where status <> 'cerrado') then
    raise exception 'Ya hay un sorteo abierto' using errcode = '23514';
  end if;
  insert into public.crm_raffles (scheduled_for, created_by_email)
  select p_scheduled_for, m.email from public.crm_members m where m.user_id = auth.uid()
  returning id into v_id;

  insert into public.crm_raffle_entries (raffle_id, number, person_id, lead_id, signed_up_at)
  select v_id, row_number() over (order by f.created_at, f.id), f.person_id, f.id, f.created_at
  from (
    select distinct on (l.person_id) l.id, l.person_id, l.created_at
    from public.leads l
    where l.source = 'suscripcion' and l.person_id is not null and l.adult_confirmed and l.created_at < v_cutoff
    order by l.person_id, l.created_at, l.id
  ) f;
  get diagnostics v_count = row_count;

  update public.crm_raffles r set
    entries_count = v_count,
    entries_digest = (
      select encode(extensions.digest(coalesce(string_agg(e.number::text || ':' || e.lead_id::text, ',' order by e.number), ''), 'sha256'), 'hex')
      from public.crm_raffle_entries e where e.raffle_id = v_id
    )
  where r.id = v_id;
  perform crm_private.crm_audit('preparar_sorteo', 'crm_raffles', v_id::text, jsonb_build_object('participantes', v_count));
  return v_id;
end;
$$;

-- Sortea: titulares y suplentes en orden. Si sale un número repetido, se vuelve a sortear.
create function public.crm_raffle_draw(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_raffle public.crm_raffles;
  v_open boolean;
  v_needed integer;
  v_attempt integer := 0;
  v_number integer;
  v_position integer := 0;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('sorteo.gestionar'));
  select * into v_raffle from public.crm_raffles where id = p_id for update;
  if not found then
    raise exception 'El sorteo no existe' using errcode = 'P0002';
  end if;
  if v_raffle.status <> 'preparado' then
    raise exception 'Este sorteo ya se hizo' using errcode = '23514';
  end if;
  select s.enrollments_open into v_open from public.crm_enrollment_settings s where s.id = 1;
  if not v_open then
    raise exception 'Las Bases dicen que el sorteo se hace después de abrir inscripciones: abrilas primero' using errcode = '23514';
  end if;
  if v_raffle.entries_count = 0 then
    raise exception 'No hay personas anotadas para sortear' using errcode = '23514';
  end if;
  v_needed := least(v_raffle.winners + v_raffle.substitutes, v_raffle.entries_count);

  while v_position < v_needed loop
    v_attempt := v_attempt + 1;
    v_number := crm_private.crm_random_int(v_raffle.entries_count);
    if exists (select 1 from public.crm_raffle_picks k where k.raffle_id = p_id and k.entry_number = v_number) then
      insert into public.crm_raffle_draws values (p_id, v_attempt, v_number, true);
      continue;
    end if;
    insert into public.crm_raffle_draws values (p_id, v_attempt, v_number, false);
    v_position := v_position + 1;
    insert into public.crm_raffle_picks (raffle_id, position, role, entry_number, person_id, status)
    select p_id, v_position,
           case when v_position <= v_raffle.winners then 'titular' else 'suplente' end,
           v_number, e.person_id,
           case when v_position <= v_raffle.winners then 'por_avisar' else 'en_espera' end
    from public.crm_raffle_entries e where e.raffle_id = p_id and e.number = v_number;
  end loop;

  update public.crm_raffles set status = 'sorteado', drawn_at = now(),
    drawn_by_email = (select m.email from public.crm_members m where m.user_id = auth.uid())
  where id = p_id;
  perform crm_private.crm_audit('sortear_becas', 'crm_raffles', p_id::text,
    jsonb_build_object('numeros', (select jsonb_agg(k.entry_number order by k.position) from public.crm_raffle_picks k where k.raffle_id = p_id)));
  return (select jsonb_agg(jsonb_build_object('position', k.position, 'role', k.role, 'number', k.entry_number) order by k.position)
          from public.crm_raffle_picks k where k.raffle_id = p_id);
end;
$$;

-- Avisa a una persona ganadora: email con la plantilla y los plazos (7 días para responder, 30 para contratar).
create function public.crm_raffle_notify(p_pick_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pick public.crm_raffle_picks;
  v_person public.crm_people;
  v_template public.crm_email_templates;
  v_values jsonb;
  v_raffle public.crm_raffles;
  v_today date := crm_private.crm_today_ar();
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('sorteo.gestionar'));
  select * into v_pick from public.crm_raffle_picks where id = p_pick_id for update;
  if not found then
    raise exception 'La persona sorteada no existe' using errcode = 'P0002';
  end if;
  if v_pick.status <> 'por_avisar' then
    raise exception 'A esta persona no le toca el aviso ahora' using errcode = '23514';
  end if;
  select * into v_person from public.crm_people where id = v_pick.person_id;
  if not found or not crm_private.crm_email_looks_valid(v_person.email) then
    raise exception 'La persona no tiene un email válido: registrá que no respondió para pasar al suplente' using errcode = '23514';
  end if;
  select * into v_raffle from public.crm_raffles where id = v_pick.raffle_id;
  select * into v_template from public.crm_email_templates where key = 'aviso_beca';
  v_values := jsonb_build_object(
    'nombre', coalesce(v_person.first_name, ''),
    'numero', v_pick.entry_number::text,
    'descuento', v_raffle.discount_percent::text,
    'responder_antes', to_char(v_today + 7, 'DD/MM/YYYY'),
    'contratar_antes', to_char(v_today + 30, 'DD/MM/YYYY')
  );
  insert into public.crm_emails (kind, template_key, person_id, to_email, subject, body, created_by, created_by_email)
  select 'aviso', v_template.key, v_person.id, btrim(v_person.email),
         crm_private.crm_render(v_template.subject, v_values), crm_private.crm_render(v_template.body, v_values),
         auth.uid(), m.email
  from public.crm_members m where m.user_id = auth.uid();
  update public.crm_raffle_picks set status = 'avisada', notified_at = now(), respond_by = v_today + 7, beca_until = v_today + 30
  where id = p_pick_id;
  perform crm_private.crm_audit('avisar_beca', 'crm_raffles', v_pick.raffle_id::text, jsonb_build_object('numero', v_pick.entry_number));
end;
$$;

-- Respuesta de la persona avisada. Si no la usa, la beca pasa al primer suplente en espera.
create function public.crm_raffle_resolve(p_pick_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pick public.crm_raffle_picks;
  v_next uuid;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('sorteo.gestionar'));
  if p_status not in ('acepto', 'rechazo', 'sin_respuesta') then
    raise exception 'Estado inválido' using errcode = '23514';
  end if;
  select * into v_pick from public.crm_raffle_picks where id = p_pick_id for update;
  if not found then
    raise exception 'La persona sorteada no existe' using errcode = 'P0002';
  end if;
  if p_status = 'acepto' and v_pick.status <> 'avisada' then
    raise exception 'Solo acepta quien fue avisada' using errcode = '23514';
  end if;
  if p_status = 'sin_respuesta' and v_pick.status = 'avisada' and v_pick.respond_by >= crm_private.crm_today_ar() then
    raise exception 'Todavía está dentro de los 7 días para responder (hasta el %)', to_char(v_pick.respond_by, 'DD/MM/YYYY') using errcode = '23514';
  end if;
  if v_pick.status not in ('avisada', 'por_avisar') then
    raise exception 'Esta beca ya se resolvió' using errcode = '23514';
  end if;
  update public.crm_raffle_picks set status = p_status, resolved_at = now() where id = p_pick_id;
  if p_status <> 'acepto' then
    select k.id into v_next from public.crm_raffle_picks k
    where k.raffle_id = v_pick.raffle_id and k.status = 'en_espera' order by k.position limit 1;
    if v_next is not null then
      update public.crm_raffle_picks set status = 'por_avisar' where id = v_next;
    end if;
  end if;
  perform crm_private.crm_audit('resolver_beca', 'crm_raffles', v_pick.raffle_id::text,
    jsonb_build_object('numero', v_pick.entry_number, 'estado', p_status));
end;
$$;

create function public.crm_raffle_close(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('sorteo.gestionar'));
  update public.crm_raffles set status = 'cerrado', closed_at = now() where id = p_id and status <> 'cerrado';
  if not found then
    raise exception 'El sorteo no existe o ya está cerrado' using errcode = 'P0002';
  end if;
  perform crm_private.crm_audit('cerrar_sorteo', 'crm_raffles', p_id::text, '{}'::jsonb);
end;
$$;

create function public.crm_raffle_view()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_people boolean;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('sorteo.gestionar'));
  v_people := crm_private.crm_has_permission('personas.ver');
  return jsonb_build_object(
    'enrollments_open', (select s.enrollments_open from public.crm_enrollment_settings s where s.id = 1),
    'opened_at', (select s.opened_at from public.crm_enrollment_settings s where s.id = 1),
    'waitlist_count', (
      select count(distinct l.person_id) from public.leads l
      where l.source = 'suscripcion' and l.person_id is not null and l.adult_confirmed
    ),
    'raffles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'scheduled_for', r.scheduled_for, 'winners', r.winners,
        'substitutes', r.substitutes, 'discount_percent', r.discount_percent, 'entries_count', r.entries_count,
        'entries_digest', r.entries_digest, 'created_at', r.created_at, 'created_by_email', r.created_by_email,
        'drawn_at', r.drawn_at, 'drawn_by_email', r.drawn_by_email, 'closed_at', r.closed_at,
        'draws', coalesce((select jsonb_agg(jsonb_build_object('attempt', d.attempt, 'number', d.number, 'repeated', d.repeated) order by d.attempt)
                           from public.crm_raffle_draws d where d.raffle_id = r.id), '[]'::jsonb),
        'picks', coalesce((select jsonb_agg(jsonb_build_object(
            'id', k.id, 'position', k.position, 'role', k.role, 'number', k.entry_number, 'status', k.status,
            'person_id', case when v_people then k.person_id end,
            'name', case when v_people then nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') end,
            -- Nombre e inicial del apellido, solo si autorizó publicarlo y no lo retiró.
            'public_name', case when (
                select c.granted from public.crm_consents c
                where c.person_id = k.person_id and c.kind = 'publicar_nombre' order by c.recorded_at desc, c.id desc limit 1
              ) then nullif(btrim(concat_ws(' ', p.first_name, left(p.last_name, 1) || '.')), '') end,
            'notified_at', k.notified_at, 'respond_by', k.respond_by, 'beca_until', k.beca_until,
            'resolved_at', k.resolved_at, 'subscription_id', k.subscription_id
          ) order by k.position)
          from public.crm_raffle_picks k left join public.crm_people p on p.id = k.person_id
          where k.raffle_id = r.id), '[]'::jsonb)
      ) order by r.created_at desc)
      from public.crm_raffles r
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones para el equipo: suscripciones y pagos
-- ---------------------------------------------------------------------------
create function public.crm_subscriptions_list()
returns table (
  id uuid, code text, person_id uuid, person_name text, kind text, master_id uuid, product text,
  status text, provider text, currency text, started_at timestamptz, current_period_end timestamptz,
  auto_renew boolean, renewal_amount numeric, renewal_notice_for date, beca boolean,
  last_payment_at timestamptz, guarantee_until date, withdrawal_until date, days_to_end integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := crm_private.crm_today_ar();
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('suscripciones.ver'));
  return query
  select s.id, s.code, s.person_id, nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
         s.kind, s.master_id, crm_private.crm_product_name(s.kind, s.master_id),
         s.status, s.provider, s.currency, s.started_at, s.current_period_end, s.auto_renew,
         case when crm_private.crm_has_permission('pagos.ver') then s.renewal_amount end,
         s.renewal_notice_for, s.beca_pick_id is not null,
         lp.paid_at, lp.guarantee_until, lp.withdrawal_until,
         crm_private.crm_local_date(s.current_period_end) - v_today
  from public.crm_subscriptions s
  join public.crm_people p on p.id = s.person_id
  left join lateral (
    select y.paid_at, y.guarantee_until, y.withdrawal_until from public.crm_payments y
    where y.subscription_id = s.id order by y.paid_at desc limit 1
  ) lp on true
  order by (s.status in ('activa', 'cancelada')) desc, s.current_period_end;
end;
$$;

create function public.crm_subscription_detail(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_money boolean;
  v_result jsonb;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('suscripciones.ver'));
  v_money := crm_private.crm_has_permission('pagos.ver');
  select jsonb_build_object(
    'id', s.id, 'code', s.code, 'person_id', s.person_id,
    'person_name', nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
    'kind', s.kind, 'product', crm_private.crm_product_name(s.kind, s.master_id), 'status', s.status,
    'provider', s.provider, 'provider_ref', s.provider_ref, 'currency', s.currency, 'started_at', s.started_at,
    'current_period_start', s.current_period_start, 'current_period_end', s.current_period_end,
    'auto_renew', s.auto_renew, 'cancel_requested_at', s.cancel_requested_at, 'ended_at', s.ended_at,
    'renewal_amount', case when v_money then s.renewal_amount end, 'renewal_notice_for', s.renewal_notice_for,
    'beca', s.beca_pick_id is not null, 'notes', s.notes, 'created_by_email', s.created_by_email,
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', y.id, 'kind', y.kind, 'provider', y.provider, 'provider_payment_id', y.provider_payment_id,
        'amount', case when v_money then y.amount end, 'currency', y.currency,
        'usd_list_price', case when v_money then y.usd_list_price end, 'fx_rate', case when v_money then y.fx_rate end,
        'beca', y.beca, 'status', y.status, 'paid_at', y.paid_at, 'period_start', y.period_start, 'period_end', y.period_end,
        'guarantee_until', y.guarantee_until, 'withdrawal_until', y.withdrawal_until,
        'refunded_amount', case when v_money then y.refunded_amount end, 'refunded_at', y.refunded_at,
        'refund_reason', y.refund_reason, 'refund_note', y.refund_note, 'recorded_by_email', y.recorded_by_email
      ) order by y.paid_at desc)
      from public.crm_payments y where y.subscription_id = s.id
    ), '[]'::jsonb)
  ) into v_result
  from public.crm_subscriptions s join public.crm_people p on p.id = s.person_id
  where s.id = p_id;
  if v_result is null then
    raise exception 'La suscripción no existe' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

-- Registro manual: transferencias, pruebas o cobros que no llegaron solos.
create function public.crm_payment_register(
  p_person_id uuid, p_kind text, p_master_id uuid, p_amount numeric, p_currency text, p_paid_at timestamptz,
  p_provider text default 'manual', p_provider_payment_id text default null, p_subscription_id uuid default null,
  p_beca_pick_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment uuid;
  v_sub uuid;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('suscripciones.gestionar'));
  if p_provider not in ('mercadopago', 'paypal', 'manual') or p_currency not in ('ARS', 'USD') then
    raise exception 'Medio de pago o moneda inválidos' using errcode = '23514';
  end if;
  v_payment := crm_private.crm_record_payment(
    p_subscription_id, p_person_id, p_kind, p_master_id, p_provider, null, p_provider_payment_id,
    p_amount, p_currency, p_paid_at, p_beca_pick_id, auth.uid(),
    (select m.email from public.crm_members m where m.user_id = auth.uid())
  );
  select y.subscription_id into v_sub from public.crm_payments y where y.id = v_payment;
  perform crm_private.crm_audit(
    case when p_subscription_id is null then 'registrar_alta' else 'registrar_renovacion' end,
    'crm_subscriptions', v_sub::text,
    jsonb_build_object('moneda', p_currency, 'medio', p_provider, 'beca', p_beca_pick_id is not null));
  return v_sub;
end;
$$;

-- Baja: no se renueva y mantiene el acceso hasta el final del año pagado.
create function public.crm_subscription_cancel(p_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sub public.crm_subscriptions;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('suscripciones.gestionar'));
  select * into v_sub from public.crm_subscriptions where id = p_id for update;
  if not found then
    raise exception 'La suscripción no existe' using errcode = 'P0002';
  end if;
  if v_sub.status <> 'activa' then
    raise exception 'Solo se da de baja una suscripción activa' using errcode = '23514';
  end if;
  update public.crm_subscriptions set status = 'cancelada', auto_renew = false, cancel_requested_at = now(),
    notes = concat_ws(E'\n', notes, nullif(btrim(coalesce(p_note, '')), ''))
  where id = p_id;
  perform crm_private.crm_audit('dar_de_baja', 'crm_subscriptions', p_id::text, jsonb_build_object('codigo', v_sub.code));
end;
$$;

-- Devolución registrada (la devolución real se hace en Mercado Pago o PayPal).
-- Si se devuelve todo, la suscripción termina.
create function public.crm_payment_refund(p_payment_id uuid, p_amount numeric, p_reason text, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pay public.crm_payments;
  v_total numeric;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('suscripciones.gestionar'));
  select * into v_pay from public.crm_payments where id = p_payment_id for update;
  if not found then
    raise exception 'El pago no existe' using errcode = 'P0002';
  end if;
  if p_reason not in ('garantia', 'arrepentimiento', 'baja_de_master', 'menor_de_edad', 'otro') then
    raise exception 'Motivo inválido' using errcode = '23514';
  end if;
  if p_reason = 'otro' and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Contá el motivo de la devolución' using errcode = '23514';
  end if;
  v_total := v_pay.refunded_amount + coalesce(p_amount, 0);
  if p_amount is null or p_amount <= 0 or v_total > v_pay.amount then
    raise exception 'El monto a devolver no puede superar lo cobrado' using errcode = '22023';
  end if;
  update public.crm_payments set
    refunded_amount = v_total, refunded_at = now(), refund_reason = p_reason,
    refund_note = nullif(btrim(coalesce(p_note, '')), ''),
    status = case when v_total = amount then 'reembolsado' else 'reembolso_parcial' end
  where id = p_payment_id;
  if v_total = v_pay.amount then
    update public.crm_subscriptions set status = 'reembolsada', auto_renew = false, ended_at = now()
    where id = v_pay.subscription_id;
  end if;
  perform crm_private.crm_audit('registrar_devolucion', 'crm_subscriptions', v_pay.subscription_id::text,
    jsonb_build_object('motivo', p_reason, 'total', v_total = v_pay.amount));
end;
$$;

-- Reporte por moneda: sin conversiones.
create function public.crm_payments_report(p_from date, p_to date)
returns table (currency text, payments integer, gross numeric, refunded numeric, net numeric, becas integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform crm_private.crm_require(crm_private.crm_is_member()
    and (crm_private.crm_has_permission('pagos.ver') or crm_private.crm_has_permission('reportes.ver')));
  return query
  select y.currency, count(*)::integer, sum(y.amount), sum(y.refunded_amount), sum(y.amount - y.refunded_amount),
         count(*) filter (where y.beca)::integer
  from public.crm_payments y
  where crm_private.crm_local_date(y.paid_at) between p_from and p_to
  group by y.currency
  order by y.currency;
end;
$$;

create function public.crm_payments_list(p_from date, p_to date)
returns table (
  id uuid, subscription_id uuid, code text, person_id uuid, person_name text, product text, kind text, provider text,
  provider_payment_id text, amount numeric, currency text, fx_rate numeric, beca boolean, status text,
  paid_at timestamptz, refunded_amount numeric, guarantee_until date, withdrawal_until date
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('pagos.ver'));
  return query
  select y.id, y.subscription_id, s.code, y.person_id, nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
         crm_private.crm_product_name(s.kind, s.master_id), y.kind, y.provider, y.provider_payment_id,
         y.amount, y.currency, y.fx_rate, y.beca, y.status, y.paid_at, y.refunded_amount, y.guarantee_until, y.withdrawal_until
  from public.crm_payments y
  join public.crm_subscriptions s on s.id = y.subscription_id
  join public.crm_people p on p.id = y.person_id
  where crm_private.crm_local_date(y.paid_at) between p_from and p_to
  order by y.paid_at desc;
end;
$$;

create function public.crm_enrollment_save(p_open boolean, p_capacity integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.crm_enrollment_settings;
  v_changed text[] := '{}';
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('configuracion.editar'));
  select * into v_old from public.crm_enrollment_settings where id = 1;
  if p_capacity is null or p_capacity < 1 then
    raise exception 'El cupo tiene que ser de al menos 1 persona' using errcode = '22023';
  end if;
  if p_open is distinct from v_old.enrollments_open then v_changed := array_append(v_changed, case when p_open then 'abrir' else 'cerrar' end); end if;
  if p_capacity is distinct from v_old.capacity then v_changed := array_append(v_changed, 'cupo'); end if;
  if cardinality(v_changed) = 0 then
    return;
  end if;
  update public.crm_enrollment_settings set
    enrollments_open = p_open, capacity = p_capacity,
    -- La primera apertura fija el corte de la lista de espera para el sorteo.
    opened_at = case when p_open and opened_at is null then now() else opened_at end,
    updated_by_email = (select m.email from public.crm_members m where m.user_id = auth.uid())
  where id = 1;
  perform crm_private.crm_audit('editar_inscripciones', 'crm_enrollment_settings', '1',
    jsonb_build_object('cambios', to_jsonb(v_changed), 'cupo', p_capacity, 'abiertas', p_open));
end;
$$;

create function public.crm_enrollment_view()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform crm_private.crm_require(crm_private.crm_is_member()
    and (crm_private.crm_has_permission('configuracion.editar') or crm_private.crm_has_permission('suscripciones.ver')));
  return (
    select jsonb_build_object(
      'enrollments_open', s.enrollments_open, 'capacity', s.capacity, 'opened_at', s.opened_at,
      'active_plans', crm_private.crm_active_plan_count(), 'site_url', s.site_url,
      'updated_at', s.updated_at, 'updated_by_email', s.updated_by_email
    ) from public.crm_enrollment_settings s where s.id = 1
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Emails: aviso de renovación y aviso de beca
-- ---------------------------------------------------------------------------
alter table public.crm_emails drop constraint crm_emails_kind_check;
alter table public.crm_emails add constraint crm_emails_kind_check check (kind in ('confirmacion', 'manual', 'prueba', 'aviso'));

insert into public.crm_email_templates (key, name, description, placeholders, subject, body) values
(
  'aviso_renovacion',
  'Aviso de renovación',
  'Sale solo 20 días antes de cada renovación (los Términos piden al menos 15).',
  array['nombre', 'producto', 'fecha', 'precio', 'forma_de_cobro', 'enlace_baja'],
  'AVA: tu {producto} se renueva el {fecha}',
  E'Hola {nombre}:\n\nTe avisamos que tu {producto} se renueva automáticamente el {fecha}.\n\nPrecio de la renovación: {precio}.\nForma de cobro: {forma_de_cobro}, con el mismo medio de pago que usaste.\n\nSi no querés renovar, podés darla de baja antes de esa fecha desde el Botón de baja de servicio: {enlace_baja}\nMantenés el acceso hasta el final del año que ya pagaste.\n\nCualquier duda, respondé este email.\n\nAVA'
),
(
  'aviso_beca',
  'Aviso a quien gana una beca',
  'Sale cuando avisás a una persona ganadora desde Sorteo.',
  array['nombre', 'numero', 'descuento', 'responder_antes', 'contratar_antes'],
  'AVA: ganaste una beca del {descuento}%',
  E'Hola {nombre}:\n\n¡Ganaste una de las becas del sorteo de AVA! Tu número en la lista de espera fue el {numero}.\n\nLa beca es un descuento del {descuento}% sobre el precio de lanzamiento del primer año de suscripción. Es personal y no se puede transferir.\n\nRespondé este email antes del {responder_antes} para confirmar que la querés usar. Después tenés hasta el {contratar_antes} para contratar el año pagando el resto.\n\nSi no respondés a tiempo, la beca pasa a la siguiente persona suplente, como dicen las Bases del sorteo.\n\nAVA'
);

-- Todos los días: vence lo que terminó y prepara los avisos de renovación.
create function crm_private.crm_subscriptions_daily()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  s record;
  v_template public.crm_email_templates;
  v_amount numeric;
  v_values jsonb;
  v_site text := (select e.site_url from public.crm_enrollment_settings e where e.id = 1);
begin
  -- Las activas tienen 3 días de margen por si el débito llega tarde; las dadas de baja terminan en fecha.
  update public.crm_subscriptions set status = 'vencida', ended_at = now()
  where (status = 'cancelada' and current_period_end < now())
     or (status = 'activa' and current_period_end < now() - interval '3 days');

  select * into v_template from public.crm_email_templates where key = 'aviso_renovacion';
  for s in
    select x.*, p.first_name, p.email from public.crm_subscriptions x join public.crm_people p on p.id = x.person_id
    where x.status = 'activa' and x.auto_renew
      and crm_private.crm_local_date(x.current_period_end) - crm_private.crm_today_ar() between 1 and 20
      and x.renewal_notice_for is distinct from crm_private.crm_local_date(x.current_period_end)
  loop
    v_amount := case when s.currency = 'ARS' then crm_private.crm_to_ars(crm_private.crm_price_usd(s.kind, s.master_id))
                     else crm_private.crm_price_usd(s.kind, s.master_id) end;
    -- Sin cotización o sin email no hay aviso: queda para el día siguiente y Hoy lo muestra.
    continue when v_amount is null or not crm_private.crm_email_looks_valid(s.email);
    v_values := jsonb_build_object(
      'nombre', coalesce(s.first_name, ''),
      'producto', lower(crm_private.crm_product_name(s.kind, s.master_id)),
      'fecha', to_char(crm_private.crm_local_date(s.current_period_end), 'DD/MM/YYYY'),
      'precio', case when s.currency = 'ARS' then '$' || replace(to_char(v_amount, 'FM999,999,999'), ',', '.') || ' (pesos argentinos)'
                     else 'USD ' || to_char(v_amount, 'FM999999990.00') end,
      'forma_de_cobro', case s.provider when 'mercadopago' then 'débito automático de Mercado Pago'
                                        when 'paypal' then 'débito automático de PayPal' else 'el medio acordado' end,
      'enlace_baja', v_site || '/baja'
    );
    insert into public.crm_emails (kind, template_key, person_id, to_email, subject, body)
    values ('aviso', v_template.key, s.person_id, btrim(s.email),
            crm_private.crm_render(v_template.subject, v_values), crm_private.crm_render(v_template.body, v_values));
    update public.crm_subscriptions set renewal_amount = v_amount, renewal_notice_for = crm_private.crm_local_date(current_period_end)
    where id = s.id;
  end loop;
end;
$$;
revoke execute on function crm_private.crm_subscriptions_daily() from public, anon, authenticated;

-- 9:11 de Buenos Aires.
select cron.schedule('crm-suscripciones-diario', '11 12 * * *', 'select crm_private.crm_subscriptions_daily()');

-- ---------------------------------------------------------------------------
-- Borrar personas: nunca a alguien con suscripciones o pagos.
-- ---------------------------------------------------------------------------
create or replace function public.crm_person_delete(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_messages integer;
  v_notes integer;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('personas.borrar'));
  if not exists (select 1 from public.crm_people where id = p_id) then
    raise exception 'La persona no existe' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.crm_subscriptions where person_id = p_id) then
    raise exception 'Tiene suscripciones o pagos registrados: no se puede borrar desde acá. Consultalo con la propietaria' using errcode = '23514';
  end if;
  select count(*) into v_messages from public.leads where person_id = p_id;
  select count(*) into v_notes from public.crm_person_notes where person_id = p_id;
  delete from public.leads where person_id = p_id;
  delete from public.crm_people where id = p_id;
  perform crm_private.crm_audit('borrar_persona', 'crm_people', p_id::text,
    jsonb_build_object('mensajes', v_messages, 'notas', v_notes));
end;
$$;

create or replace function public.crm_retention_purge(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_people uuid[];
  v_by_source jsonb;
  v_leads integer;
  v_removed_people integer;
begin
  perform crm_private.crm_require(crm_private.crm_is_member() and crm_private.crm_has_permission('personas.borrar'));
  if p_ids is null or cardinality(p_ids) = 0 then
    return jsonb_build_object('mensajes', 0, 'personas', 0);
  end if;
  if cardinality(p_ids) > 1000 then
    raise exception 'Borrá de a 1000 como máximo' using errcode = '22023';
  end if;

  with target as (
    select l.id, l.person_id, l.source
    from public.leads l
    left join public.crm_people p on p.id = l.person_id
    where l.id = any (p_ids)
      and crm_private.crm_lead_expires_at(l.source, l.created_at, p.last_activity_at) <= now()
      and crm_private.crm_can_see_source(l.source)
  ), deleted as (
    delete from public.leads l using target t where l.id = t.id
    returning t.person_id, t.source
  )
  select coalesce(array_agg(distinct person_id) filter (where person_id is not null), '{}'),
         count(*)::integer,
         coalesce((select jsonb_object_agg(source, n) from (select source, count(*) as n from deleted group by source) s), '{}')
  into v_people, v_leads, v_by_source
  from deleted;

  -- Quien se queda sin formularios deja de tener motivo para estar en la base,
  -- salvo que tenga suscripciones o pagos.
  delete from public.crm_people p
  where p.id = any (v_people) and not exists (select 1 from public.leads l where l.person_id = p.id)
    and not exists (select 1 from public.crm_subscriptions s where s.person_id = p.id);
  get diagnostics v_removed_people = row_count;

  if v_leads > 0 then
    perform crm_private.crm_audit('borrar_vencidos', 'leads', null,
      jsonb_build_object('mensajes', v_leads, 'personas', v_removed_people, 'por_tipo', v_by_source));
  end if;
  return jsonb_build_object('mensajes', v_leads, 'personas', v_removed_people);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on function
  public.crm_fx_status(), public.crm_fx_set_manual(numeric, text),
  public.crm_raffle_prepare(date), public.crm_raffle_draw(uuid), public.crm_raffle_notify(uuid),
  public.crm_raffle_resolve(uuid, text), public.crm_raffle_close(uuid), public.crm_raffle_view(),
  public.crm_subscriptions_list(), public.crm_subscription_detail(uuid),
  public.crm_payment_register(uuid, text, uuid, numeric, text, timestamptz, text, text, uuid, uuid),
  public.crm_subscription_cancel(uuid, text), public.crm_payment_refund(uuid, numeric, text, text),
  public.crm_payments_report(date, date), public.crm_payments_list(date, date),
  public.crm_enrollment_save(boolean, integer), public.crm_enrollment_view()
from public, anon;
grant execute on function
  public.crm_fx_status(), public.crm_fx_set_manual(numeric, text),
  public.crm_raffle_prepare(date), public.crm_raffle_draw(uuid), public.crm_raffle_notify(uuid),
  public.crm_raffle_resolve(uuid, text), public.crm_raffle_close(uuid), public.crm_raffle_view(),
  public.crm_subscriptions_list(), public.crm_subscription_detail(uuid),
  public.crm_payment_register(uuid, text, uuid, numeric, text, timestamptz, text, text, uuid, uuid),
  public.crm_subscription_cancel(uuid, text), public.crm_payment_refund(uuid, numeric, text, text),
  public.crm_payments_report(date, date), public.crm_payments_list(date, date),
  public.crm_enrollment_save(boolean, integer), public.crm_enrollment_view()
to authenticated;
