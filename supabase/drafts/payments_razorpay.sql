-- ANVAYA online payments (Razorpay): APPLIED 2026-11-27 (Part 1 run by the owner in the SQL
-- Editor; afterwards visitors were refused payment_mark_paid with "permission denied", and a
-- Razorpay test-mode order was paid, shown as Paid and cancelled with its stock returned).
-- PART 3 (online-only) has NOT been run.
--
-- Online payment only: UPI, cards and net banking. Cash on Delivery stays off.
--
-- HOW AN ORDER MOVES
--   1. Checkout starts      stock is reserved at once (the existing place_order does it) and the
--                           order is saved as Pending / "Awaiting payment".
--   2. The shopper pays     Razorpay confirms it (signed). The order becomes Pending / "Paid"
--                           and waits for you to Confirm it, as every order does today.
--   3. Never paid           the order stays Pending / "Awaiting payment" and keeps its stock
--                           reserved. Nothing expires on its own. In the Orders tab you cancel
--                           it when you decide: the stock goes back once and the payment shows
--                           "Unpaid". An unpaid order can only be cancelled, never confirmed.
--   4. Cancelled before dispatch (Pending or Confirmed -> Cancelled)
--                           a paid order can be refunded. The Orders tab's Refund button asks
--                           Razorpay for the full amount; "Refund Pending" becomes "Refunded"
--                           when Razorpay confirms it.
--   5. Cancelled after dispatch is not possible (Shipped can only become Delivered or
--                           Returned). This file adds no automatic refund for Returned orders:
--                           that policy is still undecided.
--
-- WHAT THIS FILE CHANGES
--   public.orders                payment_method may also be 'Razorpay'; five payment states
--                                (Awaiting payment, Paid, Unpaid, Refund Pending, Refunded) for
--                                it, with rules the database enforces
--   public.payments       NEW    one row per online order: the Razorpay order and payment ids
--   private.payment_events NEW   Razorpay event ids already handled, so a repeated notice does
--                                nothing twice
--   public.payment_place_order        service only: place_order, then mark the order online
--   public.payment_attach_gateway_order  service only: save the Razorpay order id
--   public.payment_mark_paid          service only: record a verified payment (safe to repeat)
--   public.payment_refund_update      service only: record a refund's progress (safe to repeat)
--   public.admin_begin_refund         admins only: check an order may be refunded, mark it
--                                     "Refund Pending" and return what Razorpay needs
--   private.apply_order_status        REPLACED: same rules as before plus the online ones
--
-- WHAT IT DOES NOT TOUCH
--   place_order, quote_order, price_items and every other function; products, stock, coupons,
--   storage and every existing policy. Visitors still cannot read any order or payment.
--
-- WHO CAN CALL WHAT
--   The "service only" functions are callable only by the server-side payment functions
--   (Supabase Edge Functions, which use the project's service role). Visitors and signed-in
--   shoppers cannot call them, so nobody can mark an order paid from the browser.
--   The Razorpay secret key and webhook secret are never in the database or the website:
--   they live only in the Edge Functions' secrets.
--
-- EXISTING COD ORDERS: unchanged. The old place_order still works if called directly. To
-- stop that (online-only), PART 3 at the bottom revokes it; it is a separate, optional step.
--
-- Deleting an order that has a payment is refused on purpose (money records are kept). To
-- remove a test order, delete its payments row first.
--
-- HOW TO USE
--   Part 1 (the change): run it as a whole (nothing selected). Safe to run again.
--   Part 2 (read-only): run it afterwards; every check should say PASS.
--   If any statement fails, run `rollback;` on its own before anything else.


-- =============================================================================
-- PART 1: the change (run as a whole)
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Orders: online payment and its states
-- ---------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('COD', 'Razorpay'));

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('COD - Due', 'Awaiting payment', 'Paid', 'Unpaid', 'Refund Pending', 'Refunded'));

-- Cash orders keep their three states; online orders never use "COD - Due"
alter table public.orders drop constraint if exists orders_payment_pair;
alter table public.orders add constraint orders_payment_pair check (
  (payment_method = 'COD' and payment_status in ('COD - Due', 'Paid', 'Refunded'))
  or (payment_method = 'Razorpay' and payment_status in ('Awaiting payment', 'Unpaid', 'Paid', 'Refund Pending', 'Refunded'))
);

-- Refunds only on closed orders (was: Refunded only)
alter table public.orders drop constraint if exists orders_refund_only_when_closed;
alter table public.orders add constraint orders_refund_only_when_closed
  check (payment_status not in ('Refund Pending', 'Refunded') or status in ('Cancelled', 'Returned'));

-- Unpaid orders are only ever Pending (waiting) or Cancelled (never paid)
alter table public.orders drop constraint if exists orders_unpaid_states;
alter table public.orders add constraint orders_unpaid_states check (
  (payment_status <> 'Awaiting payment' or status = 'Pending')
  and (payment_status <> 'Unpaid' or status = 'Cancelled')
);

-- ---------------------------------------------------------------------------
-- Payments: one row per online order. Admin-readable only; written by functions.
-- amount is in rupees and always equals the order's total.
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete restrict,
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  -- 'test' for rzp_test_ keys, 'live' for rzp_live_ keys; lets test rows be told apart later
  mode text not null check (mode in ('test', 'live')),
  provider_order_id text not null unique check (length(provider_order_id) between 5 and 60),
  provider_payment_id text unique check (provider_payment_id is null or length(provider_payment_id) between 5 and 60),
  refund_id text check (refund_id is null or length(refund_id) between 5 and 60),
  amount integer not null check (amount > 0),
  status text not null default 'created' check (status in ('created', 'paid', 'refund_pending', 'refunded')),
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_paid_has_payment_id check (status = 'created' or provider_payment_id is not null)
);

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
revoke all on public.payments from public, anon, authenticated;
grant select on public.payments to authenticated;

drop policy if exists "Admins can read payments" on public.payments;
create policy "Admins can read payments"
on public.payments for select to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Razorpay events already handled (no customer data is stored)
-- ---------------------------------------------------------------------------
create table if not exists private.payment_events (
  event_id text primary key check (length(event_id) between 1 and 100),
  event text not null,
  received_at timestamptz not null default now(),
  -- Why an event was set aside (unknown order, wrong amount, second payment, ...)
  note text
);
alter table private.payment_events enable row level security;
revoke all on private.payment_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- payment_place_order: place_order, then mark the new order as an online one.
-- Same arguments and replies as place_order, plus order_id, payable and provider_order_id.
-- Replaying a key returns the same order (and its Razorpay order id, if saved).
-- ---------------------------------------------------------------------------
create or replace function public.payment_place_order(
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
set lock_timeout = '2s'
as $$
declare
  v_result jsonb;
  v_order public.orders;
  v_provider_order_id text;
begin
  v_result := public.place_order(p_idempotency_key, p_items, p_customer, p_coupon_code, p_expected_total);
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    return v_result;
  end if;

  select * into v_order from public.orders where reference = v_result -> 'order' ->> 'reference' for update;

  if not coalesce((v_result ->> 'replayed')::boolean, false) then
    -- A brand-new order: it is online, and unpaid until Razorpay says otherwise
    update public.orders
    set payment_method = 'Razorpay', payment_status = 'Awaiting payment'
    where id = v_order.id and payment_method = 'COD' and payment_status = 'COD - Due' and status = 'Pending'
    returning * into v_order;
    if not found then
      raise exception 'Could not mark the new order as an online order.' using errcode = 'P0001';
    end if;
  elsif v_order.payment_method <> 'Razorpay' then
    -- The key belongs to a cash order, which this path must not turn into an online one
    return jsonb_build_object('ok', false, 'reason', 'idempotency_conflict',
      'message', 'This checkout was already used for a different order. Please review your bag and try again.');
  end if;

  select provider_order_id into v_provider_order_id from public.payments where order_id = v_order.id;

  return jsonb_set(v_result, '{order}', private.order_summary(v_order.id))
    || jsonb_build_object(
         'order_id', v_order.id,
         'total', v_order.total,
         'payable', v_order.status = 'Pending' and v_order.payment_status = 'Awaiting payment',
         'provider_order_id', v_provider_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- payment_attach_gateway_order: remember the Razorpay order made for this order.
-- If one is already saved, that one wins (two simultaneous requests end up with one).
-- ---------------------------------------------------------------------------
create or replace function public.payment_attach_gateway_order(
  p_order_id uuid,
  p_provider_order_id text,
  p_mode text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_order public.orders;
  v_payment public.payments;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_order.payment_method <> 'Razorpay' or v_order.payment_status <> 'Awaiting payment' then
    return jsonb_build_object('ok', false, 'reason', 'not_payable');
  end if;

  insert into public.payments (order_id, mode, provider_order_id, amount)
  values (v_order.id, p_mode, p_provider_order_id, v_order.total)
  on conflict (order_id) do nothing;

  select * into v_payment from public.payments where order_id = v_order.id;
  return jsonb_build_object('ok', true, 'provider_order_id', v_payment.provider_order_id,
                            'amount_paise', v_payment.amount * 100, 'mode', v_payment.mode);
end;
$$;

-- ---------------------------------------------------------------------------
-- payment_mark_paid: a payment Razorpay has confirmed. The caller (an Edge Function) has
-- already checked Razorpay's signature. Safe to repeat: the same payment again changes
-- nothing; a different payment on an already-paid order is set aside and flagged.
--
-- p_amount_paise: pass it when known (the webhook has it); it must equal the order total.
-- p_event_id:     the webhook's event id; an event already handled is ignored.
-- needs_refund in the reply is true when the order was cancelled before the money arrived.
-- ---------------------------------------------------------------------------
create or replace function public.payment_mark_paid(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount_paise integer default null,
  p_event_id text default null,
  p_event text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_payment public.payments;
  v_order public.orders;
begin
  if coalesce(p_provider_order_id, '') = '' or coalesce(p_provider_payment_id, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if p_event_id is not null then
    insert into private.payment_events (event_id, event) values (p_event_id, coalesce(p_event, 'payment'))
    on conflict (event_id) do nothing;
    if not found then
      return jsonb_build_object('ok', true, 'changed', false, 'duplicate', true);
    end if;
  end if;

  select * into v_payment from public.payments where provider_order_id = p_provider_order_id;
  if not found then
    update private.payment_events set note = 'unknown Razorpay order ' || p_provider_order_id where event_id = p_event_id;
    return jsonb_build_object('ok', false, 'reason', 'unknown_payment');
  end if;
  select * into v_order from public.orders where id = v_payment.order_id for update;

  if p_amount_paise is not null and p_amount_paise <> v_payment.amount * 100 then
    update private.payment_events set note = format('amount %s paise does not match order %s', p_amount_paise, v_order.reference)
    where event_id = p_event_id;
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  if v_payment.status <> 'created' then
    if v_payment.provider_payment_id = p_provider_payment_id then
      return jsonb_build_object('ok', true, 'changed', false, 'order', private.order_summary(v_order.id));
    end if;
    update private.payment_events
    set note = format('second payment %s on order %s, refund it in Razorpay', p_provider_payment_id, v_order.reference)
    where event_id = p_event_id;
    return jsonb_build_object('ok', false, 'reason', 'duplicate_payment');
  end if;

  update public.payments
  set status = 'paid', provider_payment_id = p_provider_payment_id, paid_at = now()
  where id = v_payment.id;

  update public.orders
  set payment_status = 'Paid'
  where id = v_order.id and payment_status in ('Awaiting payment', 'Unpaid');

  return jsonb_build_object('ok', true, 'changed', true,
    'needs_refund', v_order.status = 'Cancelled',
    'order', private.order_summary(v_order.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_begin_refund: the Refund button. Admins only. Allowed when the order is paid and
-- Cancelled (cancelled before dispatch, since a shipped order can't be cancelled). Marks it
-- "Refund Pending" and returns what the Razorpay refund call needs. If an earlier attempt
-- never reached Razorpay (still "Refund Pending" with no refund id), it may be tried again.
-- ---------------------------------------------------------------------------
create or replace function public.admin_begin_refund(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_order public.orders;
  v_payment public.payments;
begin
  if not public.is_admin() then
    raise exception 'Only admins can refund payments.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'This order no longer exists.');
  end if;
  select * into v_payment from public.payments where order_id = v_order.id for update;
  if not found or v_order.payment_method <> 'Razorpay' then
    return jsonb_build_object('ok', false, 'reason', 'no_online_payment', 'message', 'This order has no online payment to refund.');
  end if;

  if v_order.payment_status = 'Refunded' or (v_order.payment_status = 'Refund Pending' and v_payment.refund_id is not null) then
    return jsonb_build_object('ok', false, 'reason', 'already_refunded', 'message', 'A refund has already been requested for this order.');
  end if;
  if v_order.payment_status not in ('Paid', 'Refund Pending') then
    return jsonb_build_object('ok', false, 'reason', 'not_paid', 'message', 'This order has not been paid, so there is nothing to refund.');
  end if;
  if v_order.status <> 'Cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'not_cancelled',
      'message', case when v_order.status = 'Returned'
        then 'Returned orders are not refunded automatically. Refunds are made for orders cancelled before dispatch.'
        else 'Cancel the order first. Refunds are made for orders cancelled before dispatch.' end);
  end if;

  update public.orders set payment_status = 'Refund Pending' where id = v_order.id;
  update public.payments set status = 'refund_pending' where id = v_payment.id;

  return jsonb_build_object('ok', true, 'reference', v_order.reference,
    'provider_payment_id', v_payment.provider_payment_id,
    'amount_paise', v_payment.amount * 100, 'mode', v_payment.mode);
end;
$$;

-- ---------------------------------------------------------------------------
-- payment_refund_update: a refund's progress, from the refund call or Razorpay's notice.
--   p_result 'pending'   Razorpay accepted it; the money is on its way
--            'processed'  the money has been returned: the order shows Refunded
--            'failed'     it did not go through: back to Paid so it can be tried again
-- A refund of less than the full amount, or one made in Razorpay on an order that is not
-- cancelled, is set aside and flagged rather than recorded as a full refund.
-- ---------------------------------------------------------------------------
create or replace function public.payment_refund_update(
  p_provider_payment_id text,
  p_refund_id text,
  p_result text,
  p_amount_paise integer default null,
  p_event_id text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_payment public.payments;
  v_order public.orders;
begin
  if coalesce(p_provider_payment_id, '') = '' or p_result not in ('pending', 'processed', 'failed') then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if p_event_id is not null then
    insert into private.payment_events (event_id, event) values (p_event_id, 'refund.' || p_result)
    on conflict (event_id) do nothing;
    if not found then
      return jsonb_build_object('ok', true, 'changed', false, 'duplicate', true);
    end if;
  end if;

  select * into v_payment from public.payments where provider_payment_id = p_provider_payment_id;
  if not found then
    update private.payment_events set note = 'refund for unknown payment ' || p_provider_payment_id where event_id = p_event_id;
    return jsonb_build_object('ok', false, 'reason', 'unknown_payment');
  end if;
  select * into v_order from public.orders where id = v_payment.order_id for update;

  if p_result = 'failed' then
    if v_payment.status = 'refund_pending' then
      update public.payments set status = 'paid', refund_id = null where id = v_payment.id;
      update public.orders set payment_status = 'Paid' where id = v_order.id;
      return jsonb_build_object('ok', true, 'changed', true);
    end if;
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  if v_payment.status = 'refunded' then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  if p_result = 'pending' then
    if v_payment.status = 'refund_pending' then
      update public.payments set refund_id = coalesce(refund_id, p_refund_id) where id = v_payment.id;
    end if;
    return jsonb_build_object('ok', true, 'changed', v_payment.status = 'refund_pending');
  end if;

  -- processed
  if p_amount_paise is not null and p_amount_paise <> v_payment.amount * 100 then
    update private.payment_events set note = format('partial refund of %s paise on order %s, not recorded', p_amount_paise, v_order.reference)
    where event_id = p_event_id;
    return jsonb_build_object('ok', false, 'reason', 'partial_refund');
  end if;
  if v_order.status not in ('Cancelled', 'Returned') then
    update private.payment_events set note = format('refund made in Razorpay on open order %s, not recorded', v_order.reference)
    where event_id = p_event_id;
    return jsonb_build_object('ok', false, 'reason', 'order_not_closed');
  end if;

  update public.payments
  set status = 'refunded', refund_id = coalesce(refund_id, p_refund_id), refunded_at = now()
  where id = v_payment.id;
  update public.orders set payment_status = 'Refunded' where id = v_order.id;
  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Order status changes: the existing rules, plus the online ones (marked ONLINE).
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

  -- ONLINE: an order nobody has paid for can only be cancelled; cancelling it marks it Unpaid
  if v_order.payment_status = 'Awaiting payment' and v_status <> v_order.status then
    if v_status <> 'Cancelled' then
      return jsonb_build_object('ok', false, 'reason', 'payment_required',
        'message', 'This order has not been paid for yet. You can only cancel it.');
    end if;
    if p_payment_status is null then
      v_payment := 'Unpaid';
    end if;
  end if;

  if v_payment <> v_order.payment_status and not (
       (v_order.payment_status = 'COD - Due' and v_payment = 'Paid' and v_status in ('Shipped', 'Delivered'))
    or (v_order.payment_status = 'Paid' and v_payment = 'Refunded' and v_status in ('Cancelled', 'Returned'))
    -- ONLINE: unpaid -> Unpaid only by cancelling; "Refund Pending" -> Refunded by hand
    -- (after refunding in the Razorpay dashboard yourself)
    or (v_order.payment_status = 'Awaiting payment' and v_payment = 'Unpaid' and v_status = 'Cancelled')
    or (v_order.payment_status = 'Refund Pending' and v_payment = 'Refunded' and v_status in ('Cancelled', 'Returned'))
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

  -- ONLINE: a refund marked by hand also closes the payment record
  if v_payment = 'Refunded' and v_order.payment_status <> 'Refunded' then
    update public.payments set status = 'refunded', refunded_at = now()
    where order_id = v_order.id and status in ('paid', 'refund_pending');
  end if;

  return jsonb_build_object('ok', true, 'changed', true, 'status', v_status, 'payment_status', v_payment);
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what (every grant is explicit)
-- ---------------------------------------------------------------------------
revoke all on function public.payment_place_order(uuid, jsonb, jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.payment_attach_gateway_order(uuid, text, text) from public, anon, authenticated;
revoke all on function public.payment_mark_paid(text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.payment_refund_update(text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.admin_begin_refund(uuid) from public, anon, authenticated;
revoke all on function private.apply_order_status(uuid, text, text) from public, anon, authenticated;

grant execute on function public.payment_place_order(uuid, jsonb, jsonb, text, integer) to service_role;
grant execute on function public.payment_attach_gateway_order(uuid, text, text) to service_role;
grant execute on function public.payment_mark_paid(text, text, integer, text, text) to service_role;
grant execute on function public.payment_refund_update(text, text, text, integer, text) to service_role;
grant execute on function public.admin_begin_refund(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';


-- =============================================================================
-- PART 2: read-only verification (each check should say PASS)
-- =============================================================================

with checks(check_name, ok, detail) as (
  select 'payments table exists with row security',
         (select c.relrowsecurity from pg_class c where c.oid = 'public.payments'::regclass), null
  union all select 'payment_events table exists with row security',
         (select c.relrowsecurity from pg_class c where c.oid = 'private.payment_events'::regclass), null
  union all select 'visitors cannot read payments',
         not has_table_privilege('anon', 'public.payments', 'select'), null
  union all select 'visitors cannot write payments',
         not has_table_privilege('anon', 'public.payments', 'insert, update, delete'), null
  union all select 'signed-in users cannot write payments',
         not has_table_privilege('authenticated', 'public.payments', 'insert, update, delete'), null
  union all select 'only the server can mark an order paid',
         has_function_privilege('service_role', 'public.payment_mark_paid(text, text, integer, text, text)', 'execute')
         and not has_function_privilege('anon', 'public.payment_mark_paid(text, text, integer, text, text)', 'execute')
         and not has_function_privilege('authenticated', 'public.payment_mark_paid(text, text, integer, text, text)', 'execute'), null
  union all select 'only the server can place an online order',
         has_function_privilege('service_role', 'public.payment_place_order(uuid, jsonb, jsonb, text, integer)', 'execute')
         and not has_function_privilege('anon', 'public.payment_place_order(uuid, jsonb, jsonb, text, integer)', 'execute')
         and not has_function_privilege('authenticated', 'public.payment_place_order(uuid, jsonb, jsonb, text, integer)', 'execute'), null
  union all select 'only the server can save a Razorpay order or a refund result',
         has_function_privilege('service_role', 'public.payment_attach_gateway_order(uuid, text, text)', 'execute')
         and has_function_privilege('service_role', 'public.payment_refund_update(text, text, text, integer, text)', 'execute')
         and not has_function_privilege('anon', 'public.payment_attach_gateway_order(uuid, text, text)', 'execute')
         and not has_function_privilege('authenticated', 'public.payment_attach_gateway_order(uuid, text, text)', 'execute')
         and not has_function_privilege('anon', 'public.payment_refund_update(text, text, text, integer, text)', 'execute')
         and not has_function_privilege('authenticated', 'public.payment_refund_update(text, text, text, integer, text)', 'execute'), null
  union all select 'signed-in users may call the refund check (it requires an admin itself)',
         has_function_privilege('authenticated', 'public.admin_begin_refund(uuid)', 'execute')
         and not has_function_privilege('anon', 'public.admin_begin_refund(uuid)', 'execute'), null
  union all select 'every new function runs as owner with an empty search path',
         (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
          from pg_proc p
          where p.oid in ('public.payment_place_order(uuid, jsonb, jsonb, text, integer)'::regprocedure,
                          'public.payment_attach_gateway_order(uuid, text, text)'::regprocedure,
                          'public.payment_mark_paid(text, text, integer, text, text)'::regprocedure,
                          'public.payment_refund_update(text, text, text, integer, text)'::regprocedure,
                          'public.admin_begin_refund(uuid)'::regprocedure)), null
  union all select 'place_order is exactly as it was before this change',
         md5(pg_get_functiondef('public.place_order(uuid, jsonb, jsonb, text, integer)'::regprocedure)) = '5e008e79dc4d1b6e9cfdbdc581fc478e',
         'fingerprint taken from the live database before this file was written'
  union all select 'all existing orders still satisfy the new rules (orders: ' || (select count(*) from public.orders) || ')',
         not exists (select 1 from public.orders where payment_method not in ('COD', 'Razorpay')), null
)
select check_name, case when ok then 'PASS' else 'CHECK' end as result, detail from checks;


-- =============================================================================
-- PART 3 (OPTIONAL, ASK FIRST): make checkout online-only
-- =============================================================================
-- Today anyone can still call the old cash place_order function directly. Once online payment
-- is live, run this so only the payment path can create orders. It does not touch any
-- existing order. The current website calls place_order, so the website must be switched to
-- online payment first, or checkout stops working.
--
-- revoke execute on function public.place_order(uuid, jsonb, jsonb, text, integer) from anon, authenticated;
-- (undo) grant execute on function public.place_order(uuid, jsonb, jsonb, text, integer) to anon, authenticated;


-- =============================================================================
-- UNDO (only if needed, and only while there are no online orders)
-- =============================================================================
-- Restore the old apply_order_status from supabase/drafts/orders_schema.sql first, then:
-- drop function if exists public.admin_begin_refund(uuid);
-- drop function if exists public.payment_refund_update(text, text, text, integer, text);
-- drop function if exists public.payment_mark_paid(text, text, integer, text, text);
-- drop function if exists public.payment_attach_gateway_order(uuid, text, text);
-- drop function if exists public.payment_place_order(uuid, jsonb, jsonb, text, integer);
-- drop table if exists public.payments;
-- drop table if exists private.payment_events;
-- alter table public.orders drop constraint if exists orders_unpaid_states;
-- alter table public.orders drop constraint if exists orders_payment_pair;
-- alter table public.orders drop constraint if exists orders_refund_only_when_closed;
-- alter table public.orders add constraint orders_refund_only_when_closed
--   check (payment_status <> 'Refunded' or status in ('Cancelled', 'Returned'));
-- alter table public.orders drop constraint if exists orders_payment_status_check;
-- alter table public.orders add constraint orders_payment_status_check
--   check (payment_status in ('COD - Due', 'Paid', 'Refunded'));
-- alter table public.orders drop constraint if exists orders_payment_method_check;
-- alter table public.orders add constraint orders_payment_method_check check (payment_method = 'COD');
