create table if not exists public.daily_operating_costs (
  id uuid primary key default gen_random_uuid(),
  cost_date date not null,
  cost_type text not null check (
    cost_type in ('FUEL_CONSUMED', 'WASTAGE', 'OVERHEAD')
  ),
  amount numeric(12, 2) not null check (amount > 0),
  description text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists daily_operating_costs_date_type_idx
  on public.daily_operating_costs (cost_date, cost_type);

drop trigger if exists profiles_audit_changes on public.profiles;
create trigger profiles_audit_changes
after update or delete on public.profiles
for each row execute function public.log_inventory_changes();

drop trigger if exists material_procurements_audit_changes
  on public.material_procurements;
create trigger material_procurements_audit_changes
after insert or update or delete on public.material_procurements
for each row execute function public.log_inventory_changes();

drop trigger if exists product_batches_audit_changes
  on public.product_batches;
create trigger product_batches_audit_changes
after insert or update or delete on public.product_batches
for each row execute function public.log_inventory_changes();

drop trigger if exists product_batch_returns_audit_changes
  on public.product_batch_returns;
create trigger product_batch_returns_audit_changes
after insert or update or delete on public.product_batch_returns
for each row execute function public.log_inventory_changes();

drop trigger if exists daily_operating_costs_audit_changes
  on public.daily_operating_costs;
create trigger daily_operating_costs_audit_changes
after insert or update or delete on public.daily_operating_costs
for each row execute function public.log_inventory_changes();

create table if not exists public.daily_closings (
  id uuid primary key default gen_random_uuid(),
  closing_date date not null unique,
  expected_cash numeric(12, 2) not null check (expected_cash >= 0),
  actual_cash numeric(12, 2) not null check (actual_cash >= 0),
  cash_difference numeric(12, 2) generated always as
    (actual_cash - expected_cash) stored,
  closed_by uuid references public.profiles (id) on delete set null,
  closed_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists daily_closings_touch_updated_at
  on public.daily_closings;
create trigger daily_closings_touch_updated_at
before update on public.daily_closings
for each row execute function public.touch_updated_at();

drop trigger if exists daily_closings_audit_changes
  on public.daily_closings;
create trigger daily_closings_audit_changes
after insert or update or delete on public.daily_closings
for each row execute function public.log_inventory_changes();

alter table public.daily_operating_costs enable row level security;
alter table public.daily_closings enable row level security;

create policy "Owners read daily operating costs"
on public.daily_operating_costs for select to authenticated
using ((select public.current_user_role()) = 'OWNER');

create policy "Owners read daily closings"
on public.daily_closings for select to authenticated
using ((select public.current_user_role()) = 'OWNER');

revoke all on public.daily_operating_costs, public.daily_closings
  from anon, authenticated;
grant select on public.daily_operating_costs, public.daily_closings
  to authenticated;

create or replace function public.get_owner_daily_summary(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  day_start timestamptz;
  day_end timestamptz;
  gross_sales numeric(14, 2) := 0;
  cash_total numeric(14, 2) := 0;
  upi_total numeric(14, 2) := 0;
  udhaar_total numeric(14, 2) := 0;
  purchase_total numeric(14, 2) := 0;
  fuel_purchase_total numeric(14, 2) := 0;
  fuel_total numeric(14, 2) := 0;
  wastage_total numeric(14, 2) := 0;
  overhead_total numeric(14, 2) := 0;
  closing_row public.daily_closings%rowtype;
begin
  if p_date is null then
    raise exception 'Report date is required' using errcode = '22023';
  end if;
  if coalesce((select public.current_user_role()) = 'OWNER', false) = false then
    raise exception 'Owner role is required' using errcode = '42501';
  end if;

  day_start := p_date::timestamp at time zone 'Asia/Kolkata';
  day_end := (p_date + 1)::timestamp at time zone 'Asia/Kolkata';

  select
    coalesce(sum(t.total), 0),
    coalesce(sum(case
      when t.payment_mode = 'CASH' then t.total
      when t.payment_mode = 'SPLIT' then coalesce((
        select sum(tp.amount) from public.transaction_payments tp
        where tp.transaction_id = t.id and tp.payment_mode = 'CASH'
      ), 0)
      else 0
    end), 0),
    coalesce(sum(case
      when t.payment_mode = 'UPI' then t.total
      when t.payment_mode = 'SPLIT' then coalesce((
        select sum(tp.amount) from public.transaction_payments tp
        where tp.transaction_id = t.id and tp.payment_mode = 'UPI'
      ), 0)
      else 0
    end), 0),
    coalesce(sum(case when t.payment_mode = 'CREDIT' then t.total else 0 end), 0)
  into gross_sales, cash_total, upi_total, udhaar_total
  from public.transactions t
  where t.status = 'COMPLETED'
    and t.created_at >= day_start
    and t.created_at < day_end;

  select coalesce(sum(mp.total_cost), 0)
  into purchase_total
  from public.material_procurements mp
  where mp.created_at >= day_start
    and mp.created_at < day_end
    and mp.category_group <> 'FUEL';

  select coalesce(sum(mp.total_cost), 0)
  into fuel_purchase_total
  from public.material_procurements mp
  where mp.created_at >= day_start
    and mp.created_at < day_end
    and mp.category_group = 'FUEL';

  select
    coalesce(sum(case when cost_type = 'FUEL_CONSUMED' then amount else 0 end), 0),
    coalesce(sum(case when cost_type = 'WASTAGE' then amount else 0 end), 0),
    coalesce(sum(case when cost_type = 'OVERHEAD' then amount else 0 end), 0)
  into fuel_total, wastage_total, overhead_total
  from public.daily_operating_costs
  where cost_date = p_date;

  select * into closing_row
  from public.daily_closings
  where closing_date = p_date;

  return jsonb_build_object(
    'report_date', p_date,
    'gross_sales', gross_sales,
    'cash_total', cash_total,
    'upi_total', upi_total,
    'udhaar_total', udhaar_total,
    'expected_cash', cash_total,
    'purchase_total', purchase_total,
    'fuel_purchase_total', fuel_purchase_total,
    'fuel_total', fuel_total,
    'wastage_total', wastage_total,
    'overhead_total', overhead_total,
    'net_margin', gross_sales - purchase_total - fuel_total - wastage_total - overhead_total,
    'actual_cash', closing_row.actual_cash,
    'cash_difference', closing_row.cash_difference,
    'closed_by_name', closing_row.closed_by_name,
    'closed_at', closing_row.updated_at
  );
end;
$$;

create or replace function public.record_daily_operating_cost(
  p_date date,
  p_cost_type text,
  p_amount numeric,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  cost_id uuid;
begin
  if coalesce((select public.current_user_role()) = 'OWNER', false) = false then
    raise exception 'Owner role is required' using errcode = '42501';
  end if;
  if p_date is null
    or p_cost_type not in ('FUEL_CONSUMED', 'WASTAGE', 'OVERHEAD')
    or p_amount is null or p_amount <= 0
    or nullif(btrim(p_description), '') is null then
    raise exception 'Enter a valid date, category, amount, and description'
      using errcode = '22023';
  end if;

  select full_name into actor_name
  from public.profiles where id = actor_id and is_active = true;
  if actor_name is null then
    raise exception 'Active owner profile is required' using errcode = '42501';
  end if;

  insert into public.daily_operating_costs (
    cost_date, cost_type, amount, description, created_by, created_by_name
  ) values (
    p_date, p_cost_type, p_amount, btrim(p_description), actor_id, actor_name
  )
  returning id into cost_id;

  return cost_id;
end;
$$;

create or replace function public.record_daily_closing(
  p_date date,
  p_actual_cash numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  expected_amount numeric(14, 2);
  closing_id uuid;
begin
  if coalesce((select public.current_user_role()) = 'OWNER', false) = false then
    raise exception 'Owner role is required' using errcode = '42501';
  end if;
  if p_date is null or p_actual_cash is null or p_actual_cash < 0 then
    raise exception 'Enter a valid date and non-negative counted cash'
      using errcode = '22023';
  end if;

  select full_name into actor_name
  from public.profiles where id = actor_id and is_active = true;
  if actor_name is null then
    raise exception 'Active owner profile is required' using errcode = '42501';
  end if;

  select coalesce(sum(case
    when t.payment_mode = 'CASH' then t.total
    when t.payment_mode = 'SPLIT' then coalesce((
      select sum(tp.amount) from public.transaction_payments tp
      where tp.transaction_id = t.id and tp.payment_mode = 'CASH'
    ), 0)
    else 0
  end), 0)
  into expected_amount
  from public.transactions t
  where t.status = 'COMPLETED'
    and t.created_at >= p_date::timestamp at time zone 'Asia/Kolkata'
    and t.created_at < (p_date + 1)::timestamp at time zone 'Asia/Kolkata';

  insert into public.daily_closings (
    closing_date, expected_cash, actual_cash, closed_by, closed_by_name
  ) values (
    p_date, expected_amount, p_actual_cash, actor_id, actor_name
  )
  on conflict (closing_date) do update set
    expected_cash = excluded.expected_cash,
    actual_cash = excluded.actual_cash,
    closed_by = excluded.closed_by,
    closed_by_name = excluded.closed_by_name,
    updated_at = now()
  returning id into closing_id;

  return closing_id;
end;
$$;

revoke all on function public.get_owner_daily_summary(date) from public, anon;
revoke all on function public.record_daily_operating_cost(date, text, numeric, text)
  from public, anon;
revoke all on function public.record_daily_closing(date, numeric) from public, anon;
grant execute on function public.get_owner_daily_summary(date) to authenticated;
grant execute on function public.record_daily_operating_cost(date, text, numeric, text)
  to authenticated;
grant execute on function public.record_daily_closing(date, numeric) to authenticated;
