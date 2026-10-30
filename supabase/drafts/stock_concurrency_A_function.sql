-- ANVAYA safe admin stock saves, STEP A of 2: add public.admin_set_stock
-- Run after products_schema.sql and orders_schema.sql, as the whole file in the Supabase
-- SQL Editor (nothing selected). All or nothing: if any statement fails, nothing changes.
-- Safe to run again.
--
-- Adds the function the new admin dashboard uses to change stock. Each size is sent with
-- the stock the admin saw; if an order, cancellation, return or another admin changed it
-- since, the function saves nothing and returns the live numbers.
--
-- This step changes no table permissions: the website deployed before this change keeps
-- writing stock directly, exactly as today. Stale saves are only blocked for every client
-- after STEP D (stock_concurrency_D_revoke.sql), which is run once the new dashboard is live.
--
-- Changes: one new function; EXECUTE on it for signed-in users only. Nothing else.
--
-- Success shows one row:
--   function_exists = true, security_definer = true,
--   settings = 'search_path="", lock_timeout=2s',
--   authenticated_can_execute = true, anon_can_execute = false, public_can_execute = false,
--   authenticated_stock_writes = 3 (INSERT, UPDATE, DELETE still granted until STEP D),
--   authenticated_stock_select = true

begin;

-- ---------------------------------------------------------------------------
-- Set the stock of one product's sizes, only if nothing changed since the admin loaded it
--
-- p_lines: [{"size": "XL", "quantity": 7, "expected": 5}, ...]
--   quantity  the new stock, a whole number from 0 to 9999 (the dashboard's limit)
--   expected  the stock the admin saw; a size with no stock row counts as 0
-- p_remove_other_sizes: also delete the stock rows of sizes this product's category isn't
--   sold in (after switching a kurta to a saree). p_lines must then list every size of
--   the category.
--
-- The whole request is checked before anything is written, and it is all or nothing:
-- if one line is invalid or stale, no size changes.
-- A line whose stock already equals its new quantity is fine as well, so retrying a save
-- whose reply was lost doesn't report a false conflict.
--
-- Replies:
--   {"ok": true, "changed": true|false, "stock": {"S": 4, ...}}
--   {"ok": false, "reason": "stock_changed", "current": {"XL": 4, ...}, "message": ...}
--   {"ok": false, "reason": "invalid" | "not_found" | "invalid_size", "message": ...}
-- A caller who isn't an admin gets error 42501. If the rows stay locked by an order for
-- more than 2 seconds, error 55P03 (lock timeout) and nothing changes.
--
-- Locking: the product row FOR SHARE (a category change waits until this finishes), then
-- its stock rows FOR UPDATE ordered by product_id, size: the same order quote_order,
-- place_order and apply_order_status use, so they can't deadlock with each other.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_stock(
  p_product_id text,
  p_lines jsonb,
  p_remove_other_sizes boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_category text;
  v_sizes text[];
  v_lines jsonb;
  v_requested text[];
  v_current jsonb;
  v_changed integer := 0;
  v_removed integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change stock.' using errcode = '42501';
  end if;

  -- 1. Check the whole request before touching anything
  if p_product_id is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0
     or jsonb_array_length(p_lines) > 10 then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'message', 'Send between 1 and 10 sizes.');
  end if;

  -- (case, so the numbers are only read once their types are known to be numbers)
  if exists (
    select 1 from jsonb_array_elements(p_lines) e
    where case
            when jsonb_typeof(e) is distinct from 'object'
              or jsonb_typeof(e -> 'size') is distinct from 'string'
              or jsonb_typeof(e -> 'quantity') is distinct from 'number'
              or jsonb_typeof(e -> 'expected') is distinct from 'number' then true
            else (e ->> 'quantity')::numeric not between 0 and 9999
              or (e ->> 'quantity')::numeric <> trunc((e ->> 'quantity')::numeric)
              or (e ->> 'expected')::numeric not between 0 and 2147483647
              or (e ->> 'expected')::numeric <> trunc((e ->> 'expected')::numeric)
          end
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid',
      'message', 'Each size needs a whole-number stock from 0 to 9999 and the stock it had.');
  end if;

  select jsonb_agg(jsonb_build_object(
           'size', e ->> 'size',
           'quantity', (e ->> 'quantity')::integer,
           'expected', (e ->> 'expected')::integer) order by e ->> 'size'),
         array_agg(e ->> 'size' order by e ->> 'size')
  into v_lines, v_requested
  from jsonb_array_elements(p_lines) e;

  if cardinality(v_requested) <> (select count(distinct s) from unnest(v_requested) s) then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'message', 'A size is listed twice.');
  end if;

  -- The product row stays as it is (no category change) until this transaction ends
  select p.category into v_category from public.products p where p.id = p_product_id for share;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'This product no longer exists.');
  end if;

  v_sizes := case v_category when 'Kurtas' then array['S', 'M', 'L', 'XL', 'XXL'] else array['Free Size'] end;

  if not v_requested <@ v_sizes then
    return jsonb_build_object('ok', false, 'reason', 'invalid_size',
      'message', format('%s aren''t sold in %s.', v_category,
        (select string_agg(s, ', ' order by s) from unnest(v_requested) s where s <> all (v_sizes))));
  end if;

  if p_remove_other_sizes and not v_sizes <@ v_requested then
    return jsonb_build_object('ok', false, 'reason', 'invalid',
      'message', 'Replacing the sizes needs the stock of every size this product is sold in.');
  end if;

  -- 2. Lock, compare, then write; any stale line undoes the whole block
  begin
    -- Every stock row of this product, so a removal can't race either
    perform 1
    from public.product_stock s
    where s.product_id = p_product_id
    order by s.product_id, s.size
    for update of s;

    -- Sizes without a row yet get one at 0 (which is what a missing row means), so that
    -- they are locked too; these inserts are undone below if the save is refused
    insert into public.product_stock (product_id, size, quantity)
    select p_product_id, s, 0 from unnest(v_requested) s order by s
    on conflict (product_id, size) do nothing;

    -- A row another transaction created after the first lock is locked here
    perform 1
    from public.product_stock s
    where s.product_id = p_product_id and s.size = any (v_requested)
    order by s.product_id, s.size
    for update of s;

    select jsonb_object_agg(s.size, s.quantity order by s.size)
    into v_current
    from public.product_stock s
    where s.product_id = p_product_id and s.size = any (v_requested);

    if exists (
      select 1
      from jsonb_array_elements(v_lines) l
      join public.product_stock s on s.product_id = p_product_id and s.size = l ->> 'size'
      where s.quantity <> (l ->> 'expected')::integer and s.quantity <> (l ->> 'quantity')::integer
    ) then
      raise exception 'anvaya.stock_changed' using errcode = 'P0001';
    end if;

    update public.product_stock s
    set quantity = (l ->> 'quantity')::integer
    from jsonb_array_elements(v_lines) l
    where s.product_id = p_product_id and s.size = l ->> 'size' and s.quantity <> (l ->> 'quantity')::integer;
    get diagnostics v_changed = row_count;

    if p_remove_other_sizes then
      delete from public.product_stock s where s.product_id = p_product_id and s.size <> all (v_sizes);
      get diagnostics v_removed = row_count;
    end if;
  exception
    when raise_exception then
      if sqlerrm <> 'anvaya.stock_changed' then
        raise;
      end if;
      -- Nothing was written; tell the dashboard what the stock is now
      return jsonb_build_object('ok', false, 'reason', 'stock_changed', 'current', v_current,
        'message', 'Stock changed since it was loaded, so nothing was saved.');
  end;

  return jsonb_build_object('ok', true, 'changed', v_changed + v_removed > 0,
    'stock', (select coalesce(jsonb_object_agg(s.size, s.quantity order by s.size), '{}'::jsonb)
              from public.product_stock s where s.product_id = p_product_id));
end;
$$;

revoke all on function public.admin_set_stock(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_stock(text, jsonb, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Confirmation
select
  exists (select 1 from pg_proc where oid = 'public.admin_set_stock(text, jsonb, boolean)'::regprocedure) as function_exists,
  (select prosecdef from pg_proc where oid = 'public.admin_set_stock(text, jsonb, boolean)'::regprocedure) as security_definer,
  (select array_to_string(proconfig, ', ') from pg_proc where oid = 'public.admin_set_stock(text, jsonb, boolean)'::regprocedure) as settings,
  has_function_privilege('authenticated', 'public.admin_set_stock(text, jsonb, boolean)', 'execute') as authenticated_can_execute,
  has_function_privilege('anon', 'public.admin_set_stock(text, jsonb, boolean)', 'execute') as anon_can_execute,
  exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where p.oid = 'public.admin_set_stock(text, jsonb, boolean)'::regprocedure and a.grantee = 0) as public_can_execute,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'product_stock' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) as authenticated_stock_writes,
  has_table_privilege('authenticated', 'public.product_stock', 'select') as authenticated_stock_select;
