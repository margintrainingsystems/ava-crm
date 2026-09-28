-- La lista oficial de cada año trae también el 1 de enero del año siguiente.
-- Un año cuenta como cargado solo si tiene algún feriado además del 1 de enero.
create or replace function crm_private.crm_missing_holiday_years(p_from date, p_to date)
returns integer[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(y order by y), '{}')
  from generate_series(extract(year from p_from)::integer, extract(year from greatest(p_from, p_to))::integer) as y
  where not exists (
    select 1 from public.crm_holidays h
    where h.day > make_date(y, 1, 1) and h.day < make_date(y + 1, 1, 1)
  )
$$;
