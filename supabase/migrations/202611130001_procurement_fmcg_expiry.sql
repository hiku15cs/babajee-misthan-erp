alter table public.product_batches
  add column if not exists manufacture_date date,
  add column if not exists mrp numeric(12, 2),
  add column if not exists supplier_name text,
  add column if not exists client_operation_id uuid;

create unique index if not exists product_batches_client_operation_id_idx
  on public.product_batches (client_operation_id)
  where client_operation_id is not null;

alter table public.product_batches
  drop constraint if exists product_batches_manufacture_before_expiry;
alter table public.product_batches
  add constraint product_batches_manufacture_before_expiry
  check (
    manufacture_date is null
    or expiry_date is null
    or manufacture_date <= expiry_date
  );
alter table public.product_batches
  drop constraint if exists product_batches_mrp_nonnegative;
alter table public.product_batches
  add constraint product_batches_mrp_nonnegative
  check (mrp is null or mrp >= 0);

create table if not exists public.material_procurements (
  id uuid primary key default gen_random_uuid(),
  client_operation_id uuid not null unique,
  raw_material_id uuid not null references public.raw_materials (id) on delete restrict,
  category_group text not null check (category_group in ('DAIRY', 'GROCERY', 'FUEL')),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null,
  rate_per_unit numeric(12, 2) not null check (rate_per_unit >= 0),
  total_cost numeric(14, 2) generated always as
    (round(quantity * rate_per_unit, 2)) stored,
  vendor_name text,
  logged_by uuid references public.profiles (id) on delete set null,
  logged_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists material_procurements_material_date_idx
  on public.material_procurements (raw_material_id, created_at desc);
create index if not exists material_procurements_date_idx
  on public.material_procurements (created_at desc);

create table if not exists public.product_batch_returns (
  id uuid primary key default gen_random_uuid(),
  client_operation_id uuid not null unique,
  product_batch_id uuid not null references public.product_batches (id) on delete restrict,
  quantity numeric(12, 3) not null check (quantity > 0),
  vendor_name text,
  reason text,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists product_batch_returns_batch_date_idx
  on public.product_batch_returns (product_batch_id, created_at desc);

alter table public.material_procurements enable row level security;
alter table public.product_batch_returns enable row level security;

create policy "Owners and managers read material procurement history"
on public.material_procurements for select to authenticated
using ((select public.current_user_role()) in ('OWNER', 'MANAGER'));

create policy "Owners and managers read product batch returns"
on public.product_batch_returns for select to authenticated
using ((select public.current_user_role()) in ('OWNER', 'MANAGER'));

revoke all on public.material_procurements, public.product_batch_returns from anon;
revoke all on public.material_procurements, public.product_batch_returns
  from authenticated;
grant select on public.material_procurements, public.product_batch_returns
  to authenticated;

create or replace function public.record_material_procurement(
  p_client_operation_id uuid,
  p_name text,
  p_category_group text,
  p_unit text,
  p_quantity numeric,
  p_rate_per_unit numeric,
  p_vendor_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  material_id uuid;
  procurement_id uuid;
  material_kind public.material_category;
begin
  if coalesce((select public.current_user_role()) in ('OWNER', 'MANAGER'), false) = false then
    raise exception 'Only owners and managers can record material procurement'
      using errcode = '42501';
  end if;
  if p_client_operation_id is null
    or nullif(btrim(p_name), '') is null
    or p_category_group not in ('DAIRY', 'GROCERY', 'FUEL')
    or nullif(btrim(p_unit), '') is null
    or p_quantity is null or p_quantity <= 0
    or p_rate_per_unit is null or p_rate_per_unit < 0 then
    raise exception 'Invalid material procurement details' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_client_operation_id::text, 0)
  );

  select id into procurement_id
  from public.material_procurements
  where client_operation_id = p_client_operation_id;
  if procurement_id is not null then
    return procurement_id;
  end if;

  select full_name into actor_name
  from public.profiles where id = actor_id and is_active = true;
  if actor_name is null then
    raise exception 'Active user profile is required' using errcode = '42501';
  end if;

  material_kind := case when p_category_group = 'FUEL'
    then 'FUEL'::public.material_category
    else 'INGREDIENT'::public.material_category
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.lower(btrim(p_name)) || '|' || material_kind::text || '|' ||
      pg_catalog.lower(btrim(p_unit)),
      0
    )
  );

  select id into material_id
  from public.raw_materials
  where pg_catalog.lower(name) = pg_catalog.lower(btrim(p_name))
    and category = material_kind
    and pg_catalog.lower(unit) = pg_catalog.lower(btrim(p_unit))
  order by created_at
  limit 1
  for update;

  if material_id is null then
    insert into public.raw_materials (
      name, category, unit, quantity_on_hand, purchase_price_per_unit,
      vendor_name, last_received_at, created_by, updated_by
    ) values (
      btrim(p_name), material_kind, btrim(p_unit), p_quantity,
      p_rate_per_unit, nullif(btrim(p_vendor_name), ''), now(),
      actor_id, actor_id
    )
    returning id into material_id;
  else
    update public.raw_materials
    set quantity_on_hand = quantity_on_hand + p_quantity,
        purchase_price_per_unit = p_rate_per_unit,
        vendor_name = coalesce(nullif(btrim(p_vendor_name), ''), vendor_name),
        last_received_at = now(),
        updated_by = actor_id
    where id = material_id;
  end if;

  insert into public.material_procurements (
    client_operation_id, raw_material_id, category_group, quantity, unit,
    rate_per_unit, vendor_name, logged_by, logged_by_name
  ) values (
    p_client_operation_id, material_id, p_category_group, p_quantity,
    btrim(p_unit), p_rate_per_unit, nullif(btrim(p_vendor_name), ''),
    actor_id, actor_name
  )
  returning id into procurement_id;

  return procurement_id;
end;
$$;

create or replace function public.receive_packaged_batch(
  p_client_operation_id uuid,
  p_name text,
  p_barcode text,
  p_batch_number text,
  p_manufacture_date date,
  p_expiry_date date,
  p_mrp numeric,
  p_purchase_rate numeric,
  p_quantity numeric,
  p_supplier_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  product_id uuid;
  batch_id uuid;
begin
  if coalesce((select public.current_user_role()) in ('OWNER', 'MANAGER'), false) = false then
    raise exception 'Only owners and managers can receive packaged goods'
      using errcode = '42501';
  end if;
  if p_client_operation_id is null
    or nullif(btrim(p_name), '') is null
    or nullif(btrim(p_batch_number), '') is null
    or p_manufacture_date is null or p_expiry_date is null
    or p_manufacture_date > p_expiry_date
    or p_mrp is null or p_mrp < 0
    or p_purchase_rate is null or p_purchase_rate < 0
    or p_quantity is null or p_quantity <= 0 then
    raise exception 'Invalid packaged-goods batch details' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_client_operation_id::text, 0)
  );

  select id into batch_id
  from public.product_batches
  where client_operation_id = p_client_operation_id;
  if batch_id is not null then
    return batch_id;
  end if;

  select full_name into actor_name
  from public.profiles where id = actor_id and is_active = true;
  if actor_name is null then
    raise exception 'Active user profile is required' using errcode = '42501';
  end if;

  if nullif(btrim(p_barcode), '') is not null then
    select id into product_id
    from public.products
    where barcode = btrim(p_barcode)
    for update;
  else
    select id into product_id
    from public.products
    where pg_catalog.lower(name) = pg_catalog.lower(btrim(p_name))
      and product_type = 'PACKAGED_GOOD'
    order by created_at
    limit 1
    for update;
  end if;

  if product_id is not null and not exists (
    select 1 from public.products
    where id = product_id and product_type = 'PACKAGED_GOOD'
  ) then
    raise exception 'Barcode is already assigned to a non-packaged product'
      using errcode = '23505';
  end if;

  if product_id is null then
    insert into public.products (
      name, product_type, barcode, unit, price_per_unit,
      created_by, updated_by
    ) values (
      btrim(p_name), 'PACKAGED_GOOD', nullif(btrim(p_barcode), ''),
      'piece', p_mrp, actor_id, actor_id
    )
    returning id into product_id;
  else
    update public.products
    set name = btrim(p_name),
        price_per_unit = p_mrp,
        updated_by = actor_id,
        is_active = true
    where id = product_id;
  end if;

  insert into public.product_batches (
    product_id, batch_number, quantity_received, quantity_remaining,
    unit_cost, received_at, expiry_date, manufacture_date, mrp,
    supplier_name, created_by, client_operation_id
  ) values (
    product_id, btrim(p_batch_number), p_quantity, p_quantity,
    p_purchase_rate, now(), p_expiry_date, p_manufacture_date, p_mrp,
    nullif(btrim(p_supplier_name), ''), actor_id, p_client_operation_id
  )
  returning id into batch_id;

  return batch_id;
end;
$$;

create or replace function public.mark_product_batch_return(
  p_client_operation_id uuid,
  p_batch_id uuid,
  p_quantity numeric,
  p_vendor_name text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  batch_quantity numeric(12, 3);
  return_id uuid;
begin
  if coalesce((select public.current_user_role()) in ('OWNER', 'MANAGER'), false) = false then
    raise exception 'Only owners and managers can return packaged goods'
      using errcode = '42501';
  end if;
  if p_client_operation_id is null or p_batch_id is null
    or p_quantity is null or p_quantity <= 0 then
    raise exception 'Invalid batch return details' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_client_operation_id::text, 0)
  );

  select id into return_id
  from public.product_batch_returns
  where client_operation_id = p_client_operation_id;
  if return_id is not null then
    return return_id;
  end if;

  select full_name into actor_name
  from public.profiles where id = actor_id and is_active = true;
  if actor_name is null then
    raise exception 'Active user profile is required' using errcode = '42501';
  end if;

  select quantity_remaining into batch_quantity
  from public.product_batches
  where id = p_batch_id
  for update;
  if batch_quantity is null or p_quantity > batch_quantity then
    raise exception 'Return quantity exceeds available batch stock'
      using errcode = '22023';
  end if;

  update public.product_batches
  set quantity_remaining = quantity_remaining - p_quantity
  where id = p_batch_id;

  insert into public.product_batch_returns (
    client_operation_id, product_batch_id, quantity, vendor_name,
    reason, marked_by, marked_by_name
  ) values (
    p_client_operation_id, p_batch_id, p_quantity,
    nullif(btrim(p_vendor_name), ''), nullif(btrim(p_reason), ''),
    actor_id, actor_name
  )
  returning id into return_id;

  return return_id;
end;
$$;

create or replace function public.consume_product_batches_fefo(
  p_product_id uuid,
  p_quantity numeric
)
returns table (batch_id uuid, allocated_quantity numeric, expiry_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_quantity numeric(12, 3);
  batch_row record;
  take_quantity numeric(12, 3);
begin
  if coalesce((select public.current_user_role()) in ('OWNER', 'MANAGER', 'STAFF'), false) = false then
    raise exception 'An active billing profile is required' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero' using errcode = '22023';
  end if;

  remaining_quantity := p_quantity;

  for batch_row in
    select b.id, b.quantity_remaining, b.expiry_date
    from public.product_batches b
    join public.products p on p.id = b.product_id
    where b.product_id = p_product_id
      and p.product_type = 'PACKAGED_GOOD'
      and p.is_active = true
      and b.quantity_remaining > 0
      and (b.expiry_date is null or b.expiry_date >= current_date)
    order by b.expiry_date asc nulls last, b.received_at asc, b.id
    for update of b
  loop
    exit when remaining_quantity <= 0;
    take_quantity := least(batch_row.quantity_remaining, remaining_quantity);

    update public.product_batches
    set quantity_remaining = quantity_remaining - take_quantity
    where id = batch_row.id;

    batch_id := batch_row.id;
    allocated_quantity := take_quantity;
    expiry_date := batch_row.expiry_date;
    return next;

    remaining_quantity := remaining_quantity - take_quantity;
  end loop;

  if remaining_quantity > 0 then
    raise exception 'Insufficient unexpired stock for this product'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.record_material_procurement(
  uuid, text, text, text, numeric, numeric, text
) from public, anon;
revoke all on function public.receive_packaged_batch(
  uuid, text, text, text, date, date, numeric, numeric, numeric, text
) from public, anon;
revoke all on function public.mark_product_batch_return(
  uuid, uuid, numeric, text, text
) from public, anon;
revoke all on function public.consume_product_batches_fefo(uuid, numeric)
  from public, anon;

grant execute on function public.record_material_procurement(
  uuid, text, text, text, numeric, numeric, text
) to authenticated;
grant execute on function public.receive_packaged_batch(
  uuid, text, text, text, date, date, numeric, numeric, numeric, text
) to authenticated;
grant execute on function public.mark_product_batch_return(
  uuid, uuid, numeric, text, text
) to authenticated;
grant execute on function public.consume_product_batches_fefo(uuid, numeric)
  to authenticated;
