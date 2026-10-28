-- ANVAYA orders and checkout (Phase 4): DRAFT FOR REVIEW. NOT APPLIED.
--
-- Run after products_schema.sql, in the Supabase SQL Editor, the whole file at once.
-- All or nothing. Safe to run again: it never drops tables or deletes rows; it adds
-- what is missing and re-creates functions and policies.
--
-- What it adds
--   private.checkout_settings  shipping rules and anti-abuse limits (one row, editable)
--   public.offers              coupon codes (the two existing sample codes), admin-readable only
--   public.orders              one row per order; admin-readable only
--   public.order_items         order lines with name/price copied at order time; admin-readable only
--   public.quote_order(...)    visitors: price a bag with the database's rules (no writes)
--   public.place_order(...)    visitors: validate, price, reserve stock and record an order, atomically
--   public.admin_update_order_status(...)  admins: status / payment changes, restores stock once
--   private.apply_order_status(...)        the same change for the SQL Editor (database owner only)
--
-- Visitors never read or write the order tables directly; they can only call
-- quote_order and place_order, which return only the order just placed.
--
-- Operations (stale Pending orders, limits, live checks): supabase/drafts/orders_operations.md
--
-- Adjusting limits and shipping later (no redeploy needed), for example:
--   update private.checkout_settings set max_pending_orders_per_phone = 5;
--   update private.checkout_settings set pending_window = interval '12 hours';
--   update private.checkout_settings set free_shipping_threshold = 2499, standard_shipping_fee = 149;
-- Keep src/config.ts (freeShippingThreshold, standardShippingFee) in step: the shop shows
-- those figures, the database charges these. A test compares them.

begin;

-- ---------------------------------------------------------------------------
-- Private schema: helpers and settings, never exposed through the API
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists private.checkout_settings (
  id boolean primary key default true check (id), -- exactly one row
  free_shipping_threshold integer not null check (free_shipping_threshold >= 0),
  standard_shipping_fee integer not null check (standard_shipping_fee >= 0),
  max_units_per_line integer not null check (max_units_per_line between 1 and 100),
  max_lines_per_order integer not null check (max_lines_per_order between 1 and 100),
  max_pending_orders_per_phone integer not null check (max_pending_orders_per_phone between 1 and 100),
  pending_window interval not null check (pending_window > interval '0')
);

revoke all on private.checkout_settings from public, anon, authenticated;

-- Current shop rules (src/config.ts) and the agreed limits. Kept if already present.
insert into private.checkout_settings
  (id, free_shipping_threshold, standard_shipping_fee, max_units_per_line, max_lines_per_order,
   max_pending_orders_per_phone, pending_window)
values (true, 1999, 99, 10, 20, 3, interval '24 hours')
on conflict (id) do nothing;

-- The settings row, or a clear error. Checkout fails closed without it: with no row,
-- the limits and shipping fee would otherwise be missing.
create or replace function private.checkout_settings_row()
returns private.checkout_settings
language plpgsql
stable
set search_path = ''
as $$
declare
  settings private.checkout_settings;
begin
  select * into settings from private.checkout_settings where id;
  if not found then
    raise exception 'Checkout is unavailable: the shop settings are missing.'
      using errcode = 'P0001', hint = 'Restore the row in private.checkout_settings (see orders_operations.md).';
  end if;
  return settings;
end;
$$;

-- ---------------------------------------------------------------------------
-- Coupons (the two sample codes that already exist in src/services/offerService.ts)
-- ---------------------------------------------------------------------------
create table if not exists public.offers (
  code text primary key check (code ~ '^[A-Z0-9]{3,30}$'),
  title text not null default '',
  kind text not null check (kind in ('percent', 'flat')),
  value integer not null check (value > 0),
  min_spend integer not null default 0 check (min_spend >= 0),
  enabled boolean not null default true,
  constraint offers_percent_at_most_100 check (kind <> 'percent' or value <= 100)
);

insert into public.offers (code, title, kind, value, min_spend, enabled) values
  ('ALANKRITHA10', 'Inaugural Store Discount', 'percent', 10, 1500, true),
  ('FESTIVE500', 'Festive Flat Discount', 'flat', 500, 4000, true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Shown to the customer and on WhatsApp: ANV- + 10 random Crockford base32 characters
  reference text not null unique check (reference ~ '^ANV-[0-9A-HJKMNP-TV-Z]{10}$'),
  -- Sent by the browser once per checkout attempt; with request_hash makes retries safe
  idempotency_key uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'Pending'
    check (status in ('Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled', 'Returned')),
  payment_method text not null default 'COD' check (payment_method = 'COD'),
  payment_status text not null default 'COD - Due' check (payment_status in ('COD - Due', 'Paid', 'Refunded')),
  customer_name text not null check (length(customer_name) between 1 and 100),
  customer_phone text not null check (customer_phone ~ '^[6-9][0-9]{9}$'),
  customer_email text check (customer_email is null or length(customer_email) <= 254),
  address text not null check (length(address) between 5 and 300),
  city text not null check (length(city) between 1 and 80),
  state text not null check (length(state) between 1 and 80),
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  subtotal integer not null check (subtotal > 0),
  discount integer not null default 0 check (discount >= 0 and discount <= subtotal),
  coupon_code text,
  shipping integer not null check (shipping >= 0),
  total integer not null,
  -- Set once, when a Cancelled or Returned order's stock goes back on sale
  stock_restored boolean not null default false,
  constraint orders_total_adds_up check (total = subtotal - discount + shipping),
  constraint orders_coupon_only_with_discount check ((coupon_code is null) = (discount = 0)),
  constraint orders_restored_iff_closed check (stock_restored = (status in ('Cancelled', 'Returned'))),
  constraint orders_refund_only_when_closed check (payment_status <> 'Refunded' or status in ('Cancelled', 'Returned'))
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_pending_phone_idx on public.orders (customer_phone, created_at) where status = 'Pending';

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  -- Kept as history if the product is later deleted
  product_id text references public.products (id) on delete set null,
  product_name text not null,
  size text not null check (size in ('S', 'M', 'L', 'XL', 'XXL', 'Free Size')),
  unit_price integer not null check (unit_price > 0),
  quantity integer not null check (quantity between 1 and 100),
  line_total integer not null,
  constraint order_items_line_total check (line_total = unit_price * quantity)
);

create index if not exists order_items_order_idx on public.order_items (order_id);

-- Supabase's default privileges also cover sequences; nobody needs this one directly
revoke all on sequence public.order_items_id_seq from public, anon, authenticated;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: admins read; nobody writes directly (functions only)
-- ---------------------------------------------------------------------------
alter table public.offers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on public.offers, public.orders, public.order_items from anon, authenticated;
grant select on public.offers, public.orders, public.order_items to authenticated;

drop policy if exists "Admins can read offers" on public.offers;
create policy "Admins can read offers"
on public.offers for select to authenticated
using ((select public.is_admin()));

drop policy if exists "Admins can read orders" on public.orders;
create policy "Admins can read orders"
on public.orders for select to authenticated
using ((select public.is_admin()));

drop policy if exists "Admins can read order items" on public.order_items;
create policy "Admins can read order items"
on public.order_items for select to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

-- Same rule as normalizeIndianMobile in src/utils/validation.ts
create or replace function private.normalize_phone(p_input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^91[6-9][0-9]{9}$' then substr(d, 3)
    when d ~ '^0[6-9][0-9]{9}$' then substr(d, 2)
    when d ~ '^[6-9][0-9]{9}$' then d
  end
  from (select regexp_replace(coalesce(p_input, ''), '[^0-9]', '', 'g') as d) digits;
$$;

-- A customer text field: trimmed, inner whitespace collapsed; null if missing, not text,
-- containing control characters (which could forge lines in the WhatsApp message) or too long
create or replace function private.clean_text(p_value jsonb, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) <> 'string' then null
    when (p_value #>> '{}') ~ '[[:cntrl:]]' then null
    when length(regexp_replace(btrim(p_value #>> '{}'), '\s+', ' ', 'g')) not between 1 and p_max then null
    else regexp_replace(btrim(p_value #>> '{}'), '\s+', ' ', 'g')
  end;
$$;

-- Order reference: ANV- + 10 characters from 10 bytes of a random UUID (gen_random_uuid uses
-- the cryptographic generator). Each byte modulo 32 is uniform; the UUID version/variant
-- bytes (6 and 8) are skipped. Uniqueness is enforced by the unique constraint.
create or replace function private.new_order_reference()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  raw bytea := uuid_send(gen_random_uuid());
  positions constant integer[] := array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13];
  result text := 'ANV-';
  i integer;
begin
  foreach i in array positions loop
    result := result || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

-- Validates and merges bag lines: [{ "product_id", "size", "quantity" }, ...]
-- Returns { ok: true, items: [...] } (sorted, duplicates of the same product+size combined)
-- or { ok: false, reason, message }
create or replace function private.parse_items(p_items jsonb, p_settings private.checkout_settings)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  merged jsonb;
  line_count integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_items', 'message', 'Your bag is empty.');
  end if;
  if jsonb_array_length(p_items) > p_settings.max_lines_per_order * 2 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_items', 'message', 'Too many lines in this order.');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'product_id') <> 'string'
       or jsonb_typeof(e -> 'size') <> 'string'
       or jsonb_typeof(e -> 'quantity') <> 'number'
       or length(e ->> 'product_id') not between 1 and 64
       or length(e ->> 'size') not between 1 and 20
       or (e ->> 'quantity') !~ '^[0-9]{1,4}$'
       or (e ->> 'quantity')::integer < 1
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_items', 'message', 'Some items in your bag are not valid.');
  end if;

  select jsonb_agg(jsonb_build_object('product_id', product_id, 'size', size, 'quantity', quantity) order by product_id, size),
         count(*)
    into merged, line_count
  from (
    select e ->> 'product_id' as product_id, e ->> 'size' as size, sum((e ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_items) e
    group by 1, 2
  ) lines;

  if line_count > p_settings.max_lines_per_order then
    return jsonb_build_object('ok', false, 'reason', 'too_many_lines',
      'message', format('An order can have at most %s different pieces.', p_settings.max_lines_per_order));
  end if;
  if exists (select 1 from jsonb_array_elements(merged) e where (e ->> 'quantity')::integer > p_settings.max_units_per_line) then
    return jsonb_build_object('ok', false, 'reason', 'quantity_limit',
      'message', format('You can order at most %s of each piece and size.', p_settings.max_units_per_line));
  end if;
  return jsonb_build_object('ok', true, 'items', merged);
end;
$$;

-- Prices parsed items with the current catalogue, coupon and shipping rules. With
-- p_lock, the stock rows are locked (in a fixed order, so concurrent orders can't deadlock)
-- until the calling transaction ends. Used by both quote_order and place_order.
-- Returns { lines, problems, subtotal, discount, coupon_code, coupon_status, shipping, total }
create or replace function private.price_items(p_items jsonb, p_coupon_code text, p_lock boolean, p_settings private.checkout_settings)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  lines jsonb;
  problems jsonb;
  v_subtotal integer;
  v_discount integer := 0;
  v_shipping integer;
  v_offer public.offers;
  v_code text := nullif(upper(btrim(coalesce(p_coupon_code, ''))), '');
  v_coupon_status text := 'none';
begin
  if p_lock then
    perform 1
    from public.product_stock s
    join jsonb_array_elements(p_items) e on s.product_id = e ->> 'product_id' and s.size = e ->> 'size'
    order by s.product_id, s.size
    for update of s;
  end if;

  with wanted as (
    select e ->> 'product_id' as product_id, e ->> 'size' as size, (e ->> 'quantity')::integer as quantity
    from jsonb_array_elements(p_items) e
  ),
  priced as (
    select w.product_id, w.size, w.quantity, p.name, p.status, p.category,
           coalesce(p.sale_price, p.price) as unit_price,
           coalesce(s.quantity, 0) as available,
           case
             when p.id is null then 'not_found'
             when p.status <> 'enabled' then 'not_available'
             when not ((p.category = 'Kurtas' and w.size in ('S', 'M', 'L', 'XL', 'XXL'))
                    or (p.category = 'Sarees' and w.size = 'Free Size')) then 'invalid_size'
             when coalesce(s.quantity, 0) < w.quantity then 'insufficient_stock'
           end as problem
    from wanted w
    left join public.products p on p.id = w.product_id
    left join public.product_stock s on s.product_id = w.product_id and s.size = w.size
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id', product_id, 'name', name, 'size', size, 'quantity', quantity,
      'unit_price', unit_price, 'line_total', unit_price * quantity) order by product_id, size)
      filter (where problem is null), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id', product_id, 'name', case when problem in ('not_found', 'not_available') then null else name end,
      'size', size, 'requested', quantity,
      'available', case when problem = 'insufficient_stock' then available end,
      'problem', problem) order by product_id, size)
      filter (where problem is not null), '[]'::jsonb),
    coalesce(sum(unit_price * quantity) filter (where problem is null), 0)
  into lines, problems, v_subtotal
  from priced;

  -- Coupon: same rules as getOfferDiscount in src/utils/pricing.ts
  if v_code is not null then
    select * into v_offer from public.offers where code = v_code;
    if not found or not v_offer.enabled then
      v_coupon_status := 'invalid';
    elsif v_subtotal < v_offer.min_spend then
      v_coupon_status := 'below_min_spend';
    else
      v_discount := case v_offer.kind
        when 'percent' then round(v_subtotal * v_offer.value / 100.0)::integer
        else v_offer.value
      end;
      v_discount := least(greatest(v_discount, 0), v_subtotal);
      v_coupon_status := case when v_discount > 0 then 'applied' else 'invalid' end;
    end if;
  end if;

  -- Free shipping is judged on the subtotal before any coupon (getShipping in pricing.ts)
  v_shipping := case when v_subtotal <= 0 or v_subtotal >= p_settings.free_shipping_threshold then 0
                     else p_settings.standard_shipping_fee end;

  return jsonb_build_object(
    'lines', lines,
    'problems', problems,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'coupon_code', case when v_discount > 0 then v_code end,
    'coupon_status', v_coupon_status,
    'minimum_spend', case when v_coupon_status = 'below_min_spend' then v_offer.min_spend end,
    'shipping', v_shipping,
    'total', greatest(v_subtotal - v_discount + v_shipping, 0)
  );
end;
$$;

-- The customer-facing summary of one order (only ever returned to the person who placed it)
create or replace function private.order_summary(p_order_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'reference', o.reference,
    'created_at', o.created_at,
    'status', o.status,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'customer', jsonb_build_object('name', o.customer_name, 'phone', o.customer_phone, 'email', o.customer_email,
      'address', o.address, 'city', o.city, 'state', o.state, 'pincode', o.pincode),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'product_id', i.product_id, 'name', i.product_name, 'size', i.size, 'quantity', i.quantity,
                'unit_price', i.unit_price, 'line_total', i.line_total) order by i.id), '[]'::jsonb)
              from public.order_items i where i.order_id = o.id),
    'subtotal', o.subtotal, 'discount', o.discount, 'coupon_code', o.coupon_code,
    'shipping', o.shipping, 'total', o.total)
  from public.orders o
  where o.id = p_order_id;
$$;

-- ---------------------------------------------------------------------------
-- quote_order: what the database would charge for this bag right now (no writes)
-- ---------------------------------------------------------------------------
create or replace function public.quote_order(p_items jsonb, p_coupon_code text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings private.checkout_settings;
  parsed jsonb;
  quote jsonb;
begin
  settings := private.checkout_settings_row();
  parsed := private.parse_items(p_items, settings);
  if not (parsed ->> 'ok')::boolean then
    return parsed;
  end if;
  quote := private.price_items(parsed -> 'items', p_coupon_code, false, settings);
  return jsonb_build_object('ok', jsonb_array_length(quote -> 'problems') = 0,
    'reason', case when jsonb_array_length(quote -> 'problems') > 0 then 'unavailable' end,
    'quote', quote);
end;
$$;

-- ---------------------------------------------------------------------------
-- place_order: validate, price, reserve stock and record a COD order, atomically
--
-- p_idempotency_key  one random UUID per checkout attempt (reuse it when retrying)
-- p_items            [{ "product_id": "...", "size": "M", "quantity": 1 }, ...]
-- p_customer         { "name", "phone", "email" (optional), "address", "city", "state", "pincode" }
-- p_coupon_code      optional
-- p_expected_total   the total the shopper was shown; if the database's total differs,
--                    nothing is placed and the new quote is returned (reason 'price_changed')
--
-- Returns { ok: true, replayed, order } or { ok: false, reason, message?, field?, problems?, quote? }.
-- reason: invalid_customer | invalid_items | too_many_lines | quantity_limit | unavailable |
--         price_changed | too_many_pending | idempotency_conflict
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_idempotency_key uuid,
  p_items jsonb,
  p_customer jsonb,
  p_coupon_code text,
  p_expected_total integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
-- Below Supabase's 3 s statement timeout for visitors, so a long wait ends as a clear
-- lock error (safe to retry with the same key) rather than a generic timeout
set lock_timeout = '2s'
as $$
declare
  settings private.checkout_settings;
  parsed jsonb;
  quote jsonb;
  v_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_city text;
  v_state text;
  v_pincode text;
  v_coupon text := nullif(upper(btrim(coalesce(p_coupon_code, ''))), '');
  v_hash text;
  v_existing public.orders;
  v_pending integer;
  v_order_id uuid;
  v_attempt integer := 0;
  v_constraint text;
begin
  if p_idempotency_key is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_items', 'message', 'Missing checkout key.');
  end if;
  if p_expected_total is null or p_expected_total < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_items', 'message', 'Missing order total.');
  end if;

  settings := private.checkout_settings_row();

  -- Customer details (same rules as the checkout form)
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_customer', 'field', 'name', 'message', 'Please enter your delivery details.');
  end if;
  v_name := private.clean_text(p_customer -> 'name', 100);
  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_customer', 'field', 'name', 'message', 'Please enter your full name.');
  end if;
  v_phone := private.normalize_phone(p_customer ->> 'phone');
  if v_phone is null or jsonb_typeof(p_customer -> 'phone') <> 'string' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_customer', 'field', 'phone', 'message', 'Please enter a valid 10-digit Indian mobile number.');
  end if;
  if p_customer ? 'email' and jsonb_typeof(p_customer -> 'email') = 'string' and btrim(p_customer ->> 'email') <> '' then
    v_email := private.clean_text(p_customer -> 'email', 254);
    if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_customer', 'field', 'email', 'message', 'Please enter a valid email address, or leave it blank.');
    end if;
  end if;
  v_address := private.clean_text(p_customer -> 'address', 300);
  if v_address is null or length(v_address) < 5 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_customer', 'field', 'address', 'message', 'Please provide your delivery street address.');
  end if;
  v_city := private.clean_text(p_customer -> 'city', 80);
  if v_city is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_customer', 'field', 'city', 'message', 'Please enter your city.');
  end if;
  v_state := private.clean_text(p_customer -> 'state', 80);
  if v_state is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_customer', 'field', 'state', 'message', 'Please enter your state.');
  end if;
  v_pincode := btrim(coalesce(p_customer ->> 'pincode', ''));
  if v_pincode !~ '^[1-9][0-9]{5}$' or jsonb_typeof(p_customer -> 'pincode') <> 'string' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_customer', 'field', 'pincode', 'message', 'Please enter a valid 6-digit Indian PIN code.');
  end if;

  parsed := private.parse_items(p_items, settings);
  if not (parsed ->> 'ok')::boolean then
    return parsed;
  end if;

  -- Fingerprint of what is being ordered (expected total excluded: a retry after a
  -- price change is the same request)
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'items', parsed -> 'items',
    'customer', jsonb_build_object('name', v_name, 'phone', v_phone, 'email', v_email, 'address', v_address,
                                   'city', v_city, 'state', v_state, 'pincode', v_pincode),
    'coupon', v_coupon)::text, 'UTF8')), 'hex');

  -- One request per key at a time; then the original order is replayed, or a different
  -- request with the same key is refused (without revealing the original order)
  perform pg_advisory_xact_lock(hashtextextended('anvaya.order-key.' || p_idempotency_key::text, 0));
  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash = v_hash then
      return jsonb_build_object('ok', true, 'replayed', true, 'order', private.order_summary(v_existing.id));
    end if;
    return jsonb_build_object('ok', false, 'reason', 'idempotency_conflict',
      'message', 'This checkout was already used for a different order. Please review your bag and try again.');
  end if;

  -- Pending-order limit per phone. The lock serialises orders for the same phone until
  -- this transaction ends, so simultaneous requests can't all pass the count.
  perform pg_advisory_xact_lock(hashtextextended('anvaya.order-phone.' || v_phone, 0));
  select count(*) into v_pending
  from public.orders
  where customer_phone = v_phone and status = 'Pending' and created_at > now() - settings.pending_window;
  if v_pending >= settings.max_pending_orders_per_phone then
    return jsonb_build_object('ok', false, 'reason', 'too_many_pending',
      'message', 'There are already several orders waiting for confirmation for this phone number. Please contact the boutique on WhatsApp.');
  end if;

  -- Price with stock rows locked until commit
  quote := private.price_items(parsed -> 'items', v_coupon, true, settings);
  if jsonb_array_length(quote -> 'problems') > 0 then
    return jsonb_build_object('ok', false, 'reason', 'unavailable', 'problems', quote -> 'problems', 'quote', quote);
  end if;
  if (quote ->> 'total')::integer <> p_expected_total then
    return jsonb_build_object('ok', false, 'reason', 'price_changed', 'quote', quote);
  end if;

  -- Record the order (a new reference is drawn if one ever clashes)
  loop
    begin
      insert into public.orders (reference, idempotency_key, request_hash, customer_name, customer_phone, customer_email,
                                 address, city, state, pincode, subtotal, discount, coupon_code, shipping, total)
      values (private.new_order_reference(), p_idempotency_key, v_hash, v_name, v_phone, v_email,
              v_address, v_city, v_state, v_pincode,
              (quote ->> 'subtotal')::integer, (quote ->> 'discount')::integer, quote ->> 'coupon_code',
              (quote ->> 'shipping')::integer, (quote ->> 'total')::integer)
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      v_attempt := v_attempt + 1;
      if v_constraint <> 'orders_reference_key' or v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.order_items (order_id, product_id, product_name, size, unit_price, quantity, line_total)
  select v_order_id, l ->> 'product_id', l ->> 'name', l ->> 'size',
         (l ->> 'unit_price')::integer, (l ->> 'quantity')::integer, (l ->> 'line_total')::integer
  from jsonb_array_elements(quote -> 'lines') l;

  -- Reserve the stock (rows are locked and were checked above)
  update public.product_stock s
  set quantity = s.quantity - (l ->> 'quantity')::integer
  from jsonb_array_elements(quote -> 'lines') l
  where s.product_id = l ->> 'product_id' and s.size = l ->> 'size';

  return jsonb_build_object('ok', true, 'replayed', false, 'order', private.order_summary(v_order_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Order status changes. private.apply_order_status does the work; it has no access
-- check of its own, so only the database owner can call it directly (for example from
-- the SQL Editor, see supabase/drafts/orders_operations.md). The dashboard calls
-- public.admin_update_order_status, which checks is_admin() first.
--
-- Allowed status changes (Cancelled and Returned are final):
--   Pending   -> Confirmed, Cancelled
--   Confirmed -> Shipped, Cancelled
--   Shipped   -> Delivered, Returned   (Returned = refused or returned to origin)
--   Delivered -> Returned
-- Moving to Cancelled or Returned puts the ordered quantities back in stock, once.
--
-- Payment (COD), changed only on purpose, never inferred from Delivered:
--   COD - Due -> Paid       only when the order is Shipped or Delivered (cash collected)
--   Paid      -> Refunded   only when the order is Cancelled or Returned
-- Pass null to leave either value unchanged.
-- ---------------------------------------------------------------------------
create or replace function private.apply_order_status(
  p_order_id uuid,
  p_status text default null,
  p_payment_status text default null
)
returns jsonb
language plpgsql
volatile
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_order public.orders;
  v_status text;
  v_payment text;
begin
  -- Row lock: simultaneous updates of the same order run one after another, each
  -- seeing the other's result
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'This order no longer exists.');
  end if;

  v_status := coalesce(p_status, v_order.status);
  v_payment := coalesce(p_payment_status, v_order.payment_status);

  if v_status <> v_order.status and not (
       (v_order.status = 'Pending' and v_status in ('Confirmed', 'Cancelled'))
    or (v_order.status = 'Confirmed' and v_status in ('Shipped', 'Cancelled'))
    or (v_order.status = 'Shipped' and v_status in ('Delivered', 'Returned'))
    or (v_order.status = 'Delivered' and v_status = 'Returned')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition',
      'message', format('An order that is %s can''t be changed to %s.', v_order.status, v_status));
  end if;

  if v_payment <> v_order.payment_status and not (
       (v_order.payment_status = 'COD - Due' and v_payment = 'Paid' and v_status in ('Shipped', 'Delivered'))
    or (v_order.payment_status = 'Paid' and v_payment = 'Refunded' and v_status in ('Cancelled', 'Returned'))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_payment',
      'message', format('Payment can''t be changed from %s to %s while the order is %s.', v_order.payment_status, v_payment, v_status));
  end if;

  -- Put stock back once: only on the move into Cancelled/Returned, which are final
  if v_status in ('Cancelled', 'Returned') and not v_order.stock_restored then
    perform 1
    from public.product_stock s
    join public.order_items i on i.product_id = s.product_id and i.size = s.size
    where i.order_id = v_order.id
    order by s.product_id, s.size
    for update of s;

    -- Lines whose product was deleted, or whose size it is no longer sold in, are skipped
    insert into public.product_stock (product_id, size, quantity)
    select i.product_id, i.size, sum(i.quantity)
    from public.order_items i
    join public.products p on p.id = i.product_id
    where i.order_id = v_order.id
      and ((p.category = 'Kurtas' and i.size in ('S', 'M', 'L', 'XL', 'XXL')) or (p.category = 'Sarees' and i.size = 'Free Size'))
    group by i.product_id, i.size
    on conflict (product_id, size) do update set quantity = public.product_stock.quantity + excluded.quantity;
  end if;

  -- Asking for the current values again (a double click, a retry) changes nothing
  if v_status = v_order.status and v_payment = v_order.payment_status then
    return jsonb_build_object('ok', true, 'changed', false, 'status', v_status, 'payment_status', v_payment);
  end if;

  update public.orders
  set status = v_status,
      payment_status = v_payment,
      stock_restored = v_order.stock_restored or v_status in ('Cancelled', 'Returned')
  where id = v_order.id;

  return jsonb_build_object('ok', true, 'changed', true, 'status', v_status, 'payment_status', v_payment);
end;
$$;

-- admins only (checked here, not by the caller)
create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_status text default null,
  p_payment_status text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can update orders.' using errcode = '42501';
  end if;
  return private.apply_order_status(p_order_id, p_status, p_payment_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what. Supabase grants EXECUTE on new functions to anon and
-- authenticated by default, so every grant is set explicitly here.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function public.quote_order(jsonb, text) from public, anon, authenticated;
revoke all on function public.place_order(uuid, jsonb, jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.admin_update_order_status(uuid, text, text) from public, anon, authenticated;

grant execute on function public.quote_order(jsonb, text) to anon, authenticated;
grant execute on function public.place_order(uuid, jsonb, jsonb, text, integer) to anon, authenticated;
grant execute on function public.admin_update_order_status(uuid, text, text) to authenticated;

-- Hardening for the existing trigger function from products_schema.sql: nobody needs to
-- call it directly. Triggers keep working, because firing a trigger doesn't check
-- EXECUTE on its function (the tests confirm admin edits still update updated_at).
revoke all on function public.set_updated_at() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Confirmation: should list the three new tables with rls_enabled = true
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relname in ('offers', 'orders', 'order_items')
order by c.relname;
