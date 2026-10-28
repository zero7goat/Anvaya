# ANVAYA orders: operations and live checks

Covers the database added by `orders_schema.sql`: day-to-day operations, the limits you can change, and how to check the live Supabase project after running the migration. Everything here runs in the Supabase **SQL Editor**, as its default `postgres` role (the database owner).

## 1. Stale Pending orders

Every Pending order holds its stock until someone confirms or cancels it. Nothing expires automatically.

**What counts as stale:** I suggest a Pending order older than **72 hours**. It's a business decision, so pick what suits the boutique.

**Routine (once a day is enough):**

1. List them:
   ```sql
   select reference, created_at, now() - created_at as age, customer_name, customer_phone, total
   from public.orders
   where status = 'Pending' and created_at < now() - interval '72 hours'
   order by created_at;
   ```
2. Contact the customer on WhatsApp first if you can. Confirm the order if they still want it.
3. Cancel the ones nobody wants. This puts their stock back exactly once:
   ```sql
   select reference, private.apply_order_status(id, 'Cancelled', null)
   from public.orders
   where reference in ('ANV-XXXXXXXXXX');   -- the references you decided to cancel
   ```
   Once Phase 4's dashboard is built, use the Orders tab's status menu instead. It runs the same code after checking that you're an admin.

**Never change `status` with a plain `update`.** A plain update skips putting the stock back. The database refuses it unless `stock_restored` is also set, and setting that by hand would lose the stock.

**Automatic expiry** (for example a scheduled job that cancels Pending orders after N days) isn't included. It can be proposed separately.

## 2. Limits and shipping

These settings live in `private.checkout_settings`, a single row. Changes apply to the next order, with no redeploy.

```sql
select * from private.checkout_settings;

update private.checkout_settings set max_units_per_line = 10;              -- per piece and size
update private.checkout_settings set max_lines_per_order = 20;             -- different pieces per order
update private.checkout_settings set max_pending_orders_per_phone = 3,
                                     pending_window = interval '24 hours'; -- per phone number
update private.checkout_settings set free_shipping_threshold = 1999,
                                     standard_shipping_fee = 99;
```

If you change the shipping figures, change `freeShippingThreshold` and `standardShippingFee` in `src/config.ts` too. The shop *shows* those values while the database *charges* these, and a test compares them.

**If the settings row is ever deleted, checkout stops.** Both checkout functions fail with *"Checkout is unavailable: the shop settings are missing."* rather than running without limits. To put the row back with the agreed values:

```sql
insert into private.checkout_settings
  (id, free_shipping_threshold, standard_shipping_fee, max_units_per_line, max_lines_per_order,
   max_pending_orders_per_phone, pending_window)
values (true, 1999, 99, 10, 20, 3, interval '24 hours')
on conflict (id) do nothing;
```

Coupons live in `public.offers`, and only admins can read them:

```sql
select * from public.offers;
update public.offers set enabled = false where code = 'FESTIVE500';
insert into public.offers (code, title, kind, value, min_spend) values ('XXXXXXXXXXXX', 'Private offer', 'percent', 10, 0);
```

## 3. Coupon guessing and repeated requests

**What visitors can learn.** `quote_order` returns, for the code entered:
- whether it applied, didn't meet its minimum spend, or is invalid;
- the discount on this bag;
- the minimum spend, only when the bag is below it.

It never returns the title, type or value, never says whether a code is enabled, and never lists codes. An unknown code and a disabled code get identical answers.

**What remains.** Someone can still try codes one at a time. Today's two codes are already public: `ALANKRITHA10` is the example text in the bag's coupon field, and both codes are in the shop's JavaScript.

**Controls that fit the current setup:**

1. **Treat advertised codes as public.** For any private or one-off code, use **12 or more random letters and digits**. Guessing those isn't practical.
2. **Remove the coupon list from the shop's JavaScript** (planned in the Phase 4 app changes). The bag and checkout will ask `quote_order` instead.
3. **The cost of each request is already limited.** `quote_order` is read-only and accepts at most 40 raw lines (20 after merging duplicates). Product IDs are capped at 64 characters and sizes at 20. Supabase stops visitor requests after 3 seconds.
4. **Watch for abuse.** Check Supabase → Logs → API for bursts of `rpc/quote_order` or `rpc/place_order`.
5. **If abuse actually happens,** add a small limit inside the database on failed coupon attempts per client per hour. This needs a separate approval. A rate limit on the website's hosting wouldn't help, because browsers call Supabase directly.

**Fake cash-on-delivery orders** cost nothing to place.
- **Current protection:** 3 pending orders per phone per 24 hours, at most 10 units per line, and the stale-order routine in section 1.
- **What's still possible:** someone using many phone numbers can get round the per-phone limit.
- **Stronger option:** a CAPTCHA checked by a server-side function before ordering. That's extra infrastructure, so it would be a separate proposal.

## 4. Live checks (after running the migration)

**Prerequisites:** `orders_schema.sql` has run successfully, and your admin account is in `public.admin_users`. Run the steps in order, in the SQL Editor's default `postgres` role.

### A. Access, pricing, orders, idempotency, stock, status rules (automatic, saves nothing)

Run the whole of `supabase/drafts/orders_live_checks.sql` in a new SQL Editor tab. **Expected: 37 rows, all PASS.** They are:
- **8 prerequisites:**
  - runs as the owner of the order tables;
  - can act as a visitor and as a signed-in user;
  - an admin exists and is recognised;
  - a published kurta size has 2 or more in stock;
  - a saree exists;
  - both coupons exist;
  - the settings row exists.
- **28 checks.**
- **1 summary.**

**If anything says FAIL:**
- **A prerequisite:** fix it first, because the checks below it can't be trusted.
- **"SETUP FAILED":** the script couldn't act as the role it needed, so that check tested nothing.

**Saves nothing:** each check runs as a visitor, a signed-in non-admin or your admin account, and is then rolled back. No orders, stock, price or setting changes remain, and your session's role is unchanged. You can run it again at any time.

It covers:
- **Access:**
  - visitors can't read orders, order lines, coupons or settings (each must fail with its exact "permission denied" message);
  - visitors can't write directly or call admin or private functions;
  - signed-in non-admins see no orders and are refused by the admin function.
- **Pricing:** quotes using catalogue prices and shipping; percent coupon; flat coupon below its minimum; unknown coupon.
- **Placing orders:**
  - the order is recorded and stock reduced once;
  - same key and same details gives the same order;
  - same key with different details is refused;
  - a wrong total places nothing;
  - a price change followed by a retry at the new total works.
- **Refusals:** not enough stock, hidden product (name not revealed), wrong size, more than 10 of one piece, and the 4th pending order for one phone.
- **Status and payment:**
  - Pending → Shipped is refused, and Paid is refused before shipping;
  - cancel restores stock exactly once;
  - Delivered stays unpaid until marked Paid;
  - Return restores stock once and allows Refunded.

### B. Concurrency (two SQL Editor tabs, about 5 minutes)

**The test never writes stock directly.**
- **Taking stock:** a real test order (`place_order`) reserves it. That locks the stock row before it reads or changes the quantity.
- **Giving it back:** cancelling that order (`apply_order_status`) returns exactly what the order reserved. It adds the quantity back while holding the row lock, and only once, because the order's `stock_restored` flag is set in the same step.

So, because it uses the same database code as a real order and cancellation:
- **Real customers' purchases** during the test are kept.
- **The test never overwrites anyone's stock edit.**
- **Running the cleanup again can't put the stock back twice.**

The test orders are found by their fixed test keys (`bbbbbbbb-0000-4000-8000-00000000000…`), never by name.

**What you'll see:** while the test runs, real shoppers see that size as sold out (order A holds all its units). This lasts a few minutes. Ideally run it before launch, or when the shop is quiet.

**Don't edit this size's stock in the dashboard during the test.** The dashboard *sets* a number. If you set one while order A holds units, cancelling A adds those units on top of your number. That isn't specific to this test: it happens whenever stock is edited while a real order is pending. See "Remaining limitation" below.

**Check (tab 1, read-only).** Pick a published placeholder kurta size with **1 to 10** in stock (10 is the per-line limit). Replace `<PRODUCT>` and `<SIZE>` in the blocks below, then note `stock_before`:

<!-- live-race-check -->
```sql
select s.product_id, s.size, s.quantity as stock_before,
       (select count(*) from public.orders
        where idempotency_key in ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002')) as leftover_test_orders
from public.product_stock s join public.products p on p.id = s.product_id
where s.product_id = '<PRODUCT>' and s.size = '<SIZE>' and p.status = 'enabled';
-- Expected: one row; stock_before between 1 and 10; leftover_test_orders = 0 (otherwise run the cleanup first)
```

**B1. Two orders for the last units.**

Tab 1. Order A asks for **all** the units left, and holds its order open for 20 seconds:

<!-- live-race-order-a -->
```sql
begin;
select public.place_order('bbbbbbbb-0000-4000-8000-000000000001', i.items,
  '{"name":"LIVE RACE A","phone":"9000000101","address":"Placeholder address 1","city":"Bengaluru","state":"Karnataka","pincode":"560001"}',
  null, (public.quote_order(i.items, null) -> 'quote' ->> 'total')::integer)
from (select jsonb_build_array(jsonb_build_object('product_id', product_id, 'size', size, 'quantity', quantity)) as items
      from public.product_stock where product_id = '<PRODUCT>' and size = '<SIZE>') i;
select pg_sleep(20);
commit;
```

Tab 2, started within those 20 seconds. Order B asks for 1 unit:

<!-- live-race-order-b -->
```sql
select public.place_order('bbbbbbbb-0000-4000-8000-000000000002', i.items,
  '{"name":"LIVE RACE B","phone":"9000000102","address":"Placeholder address 2","city":"Bengaluru","state":"Karnataka","pincode":"560001"}',
  null, (public.quote_order(i.items, null) -> 'quote' ->> 'total')::integer)
from (select jsonb_build_array(jsonb_build_object('product_id', '<PRODUCT>', 'size', '<SIZE>', 'quantity', 1)) as items) i;
```

What to expect:
- **Tab 2 first:** it fails after about 2 seconds with *canceling statement due to lock timeout*. That shows it waited on tab 1's lock on the stock row.
- **Tab 1:** `"ok": true` with an `ANV-…` reference, ordering `stock_before` units.
- **Tab 2 run again:** `"ok": false, "reason": "unavailable"`, with `"available": 0`.
- **If tab 1 says `insufficient_stock`:** a real customer bought one between reading the stock and locking it. Nothing was ordered, so just run tab 1 again.
- **Then check:**
  ```sql
  select count(*) from public.orders where idempotency_key in ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002');  -- 1
  select quantity from public.product_stock where product_id = '<PRODUCT>' and size = '<SIZE>';  -- 0
  ```

**B2. Two cancellations at once.**

Tab 1:

<!-- live-race-cancel -->
```sql
begin;
select private.apply_order_status((select id from public.orders where idempotency_key = 'bbbbbbbb-0000-4000-8000-000000000001'), 'Cancelled', null);
select pg_sleep(20);
commit;
```

Tab 2, within those 20 seconds:
```sql
select private.apply_order_status((select id from public.orders where idempotency_key = 'bbbbbbbb-0000-4000-8000-000000000001'), 'Cancelled', null);
```

What to expect:
- **Tab 2 first:** it fails after about 2 seconds with a lock timeout, because it waited on the order row.
- **Tab 1:** `"ok": true, "changed": true`.
- **Tab 2 run again:** `"ok": true, "changed": false`.
- **Stock is back to `stock_before`,** so A's units were returned exactly once:
  ```sql
  select quantity from public.product_stock where product_id = '<PRODUCT>' and size = '<SIZE>';  -- stock_before
  ```

**Cleanup (always run this, even after an interruption).**
- **What it does:** closes whichever test order is still open, giving back exactly what it reserved, once. It then deletes the closed test orders.
- **What it never touches:** stock directly, and any order other than the two test keys.
- **Safe to repeat:** it's one transaction, so an interruption leaves nothing half-done, and running it again is harmless.

<!-- live-race-cleanup -->
```sql
begin;
select o.reference, o.status as was,
       private.apply_order_status(o.id, case when o.status in ('Pending', 'Confirmed') then 'Cancelled' else 'Returned' end, null) ->> 'ok' as closed
from public.orders o
where o.idempotency_key in ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002')
  and o.status not in ('Cancelled', 'Returned');

delete from public.orders
where idempotency_key in ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002')
  and status in ('Cancelled', 'Returned');
commit;

select (select count(*) from public.orders
        where idempotency_key in ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002')) as test_orders_left,  -- 0
       (select quantity from public.product_stock where product_id = '<PRODUCT>' and size = '<SIZE>') as stock_now;
       -- stock_before, minus anything real customers bought during the test
```

**If the test stops partway,** run the cleanup and the stock ends at `stock_before`, less any real sales:

| Stopped at | What exists | Cleanup result |
|---|---|---|
| Before or during the check | Nothing (it only reads) | No-op |
| Tab 1 of B1 closed before its commit | Nothing (order A rolled back) | No-op |
| After B1 | Pending order A holding all units | A cancelled, units back once, A deleted |
| During B2 (before commit) | Same as after B1 | Same as after B1 |
| After B2 | Cancelled A, units already back | A deleted, stock untouched |
| During cleanup | Whatever existed before it (one transaction) | Nothing changed; run it again |
| Cleanup run twice | Nothing left | Second run is a no-op |

**Remaining limitation (not specific to this test).** The Phase 3 dashboard's stock fields and "+5 All" / "Mark Out" *set* absolute numbers. If an admin sets a number while any order is pending, cancelling that order later adds its units on top of the admin's number. The Phase 4 dashboard work should avoid this, for example:
- show units reserved by pending orders next to each size; and
- make stock edits relative ("add 5", "remove 2") instead of absolute.

### C. Through the website (after the Phase 4 app changes)

1. Place a cash-on-delivery order with a placeholder product. The success screen shows an `ANV-…` reference and the database's totals.
2. Use "Order via WhatsApp". The order is recorded first, then WhatsApp opens with the same reference and figures.
3. Turn off the network and try to order. Checkout says the order **was not placed and no stock was reserved**, and offers a WhatsApp enquiry marked as not an order.
4. Admin Orders tab: confirm, ship, deliver, mark paid; cancel a different order and check its stock comes back once.
5. Remove the website test orders: cancel them first (from the dashboard or with section 1's SQL), then `delete from public.orders where reference in (...)`.
