-- Remove the Razorpay TEST-mode orders before launch. Run in Supabase → SQL Editor.
--
-- Targets only online (Razorpay) orders with no LIVE payment: every one so far, since only
-- test keys have been used. Cash/WhatsApp orders and any live payment are never touched.
-- Open orders are cancelled first through the normal function, so their stock goes back
-- exactly once (never by editing stock). Then their payment rows and the orders, with their
-- order lines, are deleted. This can't be undone.
--
-- STEP 1 (read-only): see what will be removed. Expect your test order(s) only.

select o.reference, o.created_at, o.customer_name, o.status, o.payment_status, o.total, p.mode
from public.orders o
left join public.payments p on p.order_id = o.id
where o.payment_method = 'Razorpay'
  and not exists (select 1 from public.payments lp where lp.order_id = o.id and lp.mode = 'live')
order by o.created_at;


-- STEP 2: remove them (select from `begin;` to `commit;` and run it as a whole).

begin;

-- Close any that are still open, putting their stock back once
select o.reference,
       private.apply_order_status(o.id, case when o.status in ('Pending', 'Confirmed') then 'Cancelled' else 'Returned' end, null) ->> 'ok' as closed
from public.orders o
where o.payment_method = 'Razorpay'
  and o.status not in ('Cancelled', 'Returned')
  and not exists (select 1 from public.payments lp where lp.order_id = o.id and lp.mode = 'live');

delete from public.payments p
using public.orders o
where p.order_id = o.id and o.payment_method = 'Razorpay' and p.mode = 'test';

delete from public.orders o
where o.payment_method = 'Razorpay'
  and o.status in ('Cancelled', 'Returned')
  and not exists (select 1 from public.payments p where p.order_id = o.id);

commit;


-- STEP 3 (read-only): both should be 0.

select (select count(*) from public.orders where payment_method = 'Razorpay') as online_orders_left,
       (select count(*) from public.payments where mode = 'test') as test_payments_left;
