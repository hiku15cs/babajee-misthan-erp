alter table public.transactions
  add column if not exists client_operation_id uuid;

create unique index if not exists transactions_client_operation_id_idx
  on public.transactions (client_operation_id)
  where client_operation_id is not null;

create or replace function public.sync_offline_transaction(
  p_client_operation_id uuid,
  p_sale jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_name text;
  transaction_id uuid;
  sale_timestamp timestamptz;
  sale_payment_mode public.payment_mode;
  sale_output_mode public.output_mode;
  sale_subtotal numeric(12, 2);
  sale_discount numeric(12, 2);
  sale_tax numeric(12, 2);
  sale_total numeric(12, 2);
  item_subtotal numeric(14, 2);
  payment_total numeric(14, 2);
  item_row record;
  payment_row record;
  product_kind public.product_type;
  allocated_batch record;
  allocated_quantity numeric(12, 3);
  remaining_line_total numeric(12, 2);
  allocated_line_total numeric(12, 2);
begin
  if p_client_operation_id is null
    or jsonb_typeof(p_sale) is distinct from 'object' then
    raise exception 'A valid sale and operation ID are required'
      using errcode = '22023';
  end if;
  if coalesce(
    (select public.current_user_role()) in ('OWNER', 'MANAGER', 'STAFF'),
    false
  ) = false then
    raise exception 'An active cashier profile is required'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_sale->'items') is distinct from 'array' then
    raise exception 'Sale items must be an array'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_sale->'items') = 0 then
    raise exception 'A sale must contain at least one item'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_client_operation_id::text, 0)
  );

  select id into transaction_id
  from public.transactions
  where client_operation_id = p_client_operation_id;
  if transaction_id is not null then
    return transaction_id;
  end if;

  select full_name into actor_name
  from public.profiles
  where id = actor_id and is_active = true;
  if actor_name is null then
    raise exception 'An active cashier profile is required'
      using errcode = '42501';
  end if;

  sale_payment_mode := (p_sale->>'payment_mode')::public.payment_mode;
  sale_output_mode := coalesce(
    nullif(p_sale->>'output_mode', '')::public.output_mode,
    'SILENT'::public.output_mode
  );
  sale_subtotal := (p_sale->>'subtotal')::numeric;
  sale_discount := coalesce(nullif(p_sale->>'discount', '')::numeric, 0);
  sale_tax := coalesce(nullif(p_sale->>'tax', '')::numeric, 0);
  sale_total := (p_sale->>'total')::numeric;
  sale_timestamp := coalesce(
    nullif(p_sale->>'created_at', '')::timestamptz,
    now()
  );

  if sale_subtotal is null or sale_discount is null or sale_tax is null
    or sale_total is null or sale_payment_mode is null
    or sale_timestamp is null
    or sale_subtotal < 0 or sale_discount < 0 or sale_tax < 0 or sale_total < 0
    or sale_discount > sale_subtotal
    or sale_total <> round(sale_subtotal - sale_discount + sale_tax, 2)
    or sale_timestamp > now() + interval '5 minutes' then
    raise exception 'Sale totals or timestamp are invalid'
      using errcode = '22023';
  end if;

  select coalesce(sum(line_total), 0)
  into item_subtotal
  from jsonb_to_recordset(p_sale->'items') as item(
    product_id uuid,
    product_name text,
    quantity numeric,
    unit text,
    unit_price numeric,
    line_total numeric
  );
  if round(item_subtotal, 2) <> sale_subtotal then
    raise exception 'Sale subtotal does not match its line items'
      using errcode = '22023';
  end if;

  if sale_payment_mode = 'SPLIT' then
    if jsonb_typeof(p_sale->'payments') is distinct from 'array' then
      raise exception 'Split payments must be an array'
        using errcode = '22023';
    end if;
    if jsonb_array_length(p_sale->'payments') = 0 then
      raise exception 'Split sales require payment entries'
        using errcode = '22023';
    end if;
    select coalesce(sum(amount), 0)
    into payment_total
    from jsonb_to_recordset(p_sale->'payments') as payment(
      payment_mode text,
      amount numeric,
      reference text
    );
    if round(payment_total, 2) <> sale_total then
      raise exception 'Split payments must add up to the sale total'
        using errcode = '22023';
    end if;
  end if;

  insert into public.transactions (
    cashier_id, subtotal, discount, tax, total, payment_mode, output_mode,
    status, notes, created_at, client_operation_id
  ) values (
    actor_id, sale_subtotal, sale_discount, sale_tax, sale_total,
    sale_payment_mode, sale_output_mode, 'COMPLETED',
    nullif(p_sale->>'notes', ''), sale_timestamp, p_client_operation_id
  )
  returning id into transaction_id;

  for item_row in
    select *
    from jsonb_to_recordset(p_sale->'items') as item(
      product_id uuid,
      product_name text,
      quantity numeric,
      unit text,
      unit_price numeric,
      line_total numeric
    )
  loop
    if item_row.product_id is null
      or nullif(btrim(item_row.product_name), '') is null
      or nullif(btrim(item_row.unit), '') is null
      or item_row.quantity is null or item_row.quantity <= 0
      or item_row.unit_price is null or item_row.unit_price < 0
      or item_row.line_total is null or item_row.line_total < 0
      or round(item_row.quantity, 3) <> item_row.quantity
      or round(item_row.unit_price, 2) <> item_row.unit_price
      or round(item_row.line_total, 2) <> item_row.line_total
      or round(item_row.quantity * item_row.unit_price, 2)
        <> round(item_row.line_total, 2) then
      raise exception 'A sale line item is invalid' using errcode = '22023';
    end if;

    select product_type into product_kind
    from public.products
    where id = item_row.product_id and is_active = true;
    if product_kind is null then
      raise exception 'A sale references a missing or inactive product'
        using errcode = '22023';
    end if;

    if product_kind = 'PACKAGED_GOOD' then
      allocated_quantity := 0;
      remaining_line_total := item_row.line_total;
      for allocated_batch in
        select *
        from public.consume_product_batches_fefo(
          item_row.product_id,
          item_row.quantity
        )
      loop
        allocated_line_total := case
          when allocated_quantity + allocated_batch.allocated_quantity
            >= item_row.quantity
            then remaining_line_total
          else round(allocated_batch.allocated_quantity * item_row.unit_price, 2)
        end;

        insert into public.transaction_items (
          transaction_id, product_id, product_batch_id, product_name,
          quantity, unit, unit_price, line_total
        ) values (
          transaction_id, item_row.product_id, allocated_batch.batch_id,
          btrim(item_row.product_name), allocated_batch.allocated_quantity,
          btrim(item_row.unit), item_row.unit_price, allocated_line_total
        );

        allocated_quantity := allocated_quantity + allocated_batch.allocated_quantity;
        remaining_line_total := remaining_line_total - allocated_line_total;
      end loop;
    else
      insert into public.transaction_items (
        transaction_id, product_id, product_name, quantity, unit,
        unit_price, line_total
      ) values (
        transaction_id, item_row.product_id, btrim(item_row.product_name),
        item_row.quantity, btrim(item_row.unit), item_row.unit_price,
        item_row.line_total
      );
    end if;
  end loop;

  if sale_total > 0 then
    if sale_payment_mode = 'SPLIT' then
      for payment_row in
        select *
        from jsonb_to_recordset(p_sale->'payments') as payment(
          payment_mode text,
          amount numeric,
          reference text
        )
      loop
        if payment_row.payment_mode is null
          or payment_row.payment_mode not in ('CASH', 'UPI', 'CREDIT')
          or payment_row.amount is null or payment_row.amount <= 0 then
          raise exception 'A split payment entry is invalid'
            using errcode = '22023';
        end if;
        insert into public.transaction_payments (
          transaction_id, payment_mode, amount, reference
        ) values (
          transaction_id, payment_row.payment_mode::public.payment_mode,
          payment_row.amount, nullif(payment_row.reference, '')
        );
      end loop;
    else
      insert into public.transaction_payments (
        transaction_id, payment_mode, amount
      ) values (
        transaction_id, sale_payment_mode, sale_total
      );
    end if;
  end if;

  return transaction_id;
end;
$$;

revoke all on function public.sync_offline_transaction(uuid, jsonb)
  from public, anon;
grant execute on function public.sync_offline_transaction(uuid, jsonb)
  to authenticated;
