-- ANVAYA Phase 4 live checks (run AFTER orders_schema.sql).
--
-- Run the whole file in the Supabase SQL Editor (as the default postgres role). Each
-- check runs as a visitor (anon), a signed-in non-admin, or your admin account, and is
-- then ROLLED BACK: no orders, stock, price or setting changes are kept, and your
-- session's role is unchanged afterwards. Safe to run any number of times.
--
-- Result: prerequisite rows, then one row per check, then a summary row. Every row
-- should say PASS. A prerequisite FAIL means the checks below it can't be trusted.
-- Concurrency (two orders for the last unit, two cancels at once) can't be checked in
-- one session: see "Concurrency checks" in supabase/drafts/orders_operations.md.

-- Runs steps as the given roles and returns the last step's result, then undoes all of
-- it. Role changes are SET LOCAL inside a block that always ends in an error, so the
-- rollback restores the caller's role and settings without RESET ROLE. A role switch
-- that fails or doesn't take effect returns 'SETUP FAILED: ...', which never matches an
-- expected result.
create or replace function pg_temp.run_check(p_steps jsonb)
returns text
language plpgsql
as $$
declare
  caller constant text := current_user;
  step jsonb;
  wanted text;
  result text;
begin
  begin
    for step in select value from jsonb_array_elements(p_steps) loop
      wanted := case when step ->> 'role' = 'owner' then caller else step ->> 'role' end;
      begin
        perform set_config('request.jwt.claims',
          case when step ->> 'role' = 'owner' then ''
               else json_build_object('role', step ->> 'role', 'sub', step ->> 'sub')::text end, true);
        execute format('set local role %I', wanted);
      exception when others then
        raise exception 'anvaya-check-setup' using detail = format('could not act as %s: %s', wanted, sqlerrm);
      end;
      if current_user <> wanted then
        raise exception 'anvaya-check-setup' using detail = format('wanted role %s but running as %s', wanted, current_user);
      end if;
      if step ->> 'role' = 'owner'
         and current_user::text <> (select pg_get_userbyid(relowner)::text from pg_class where oid = 'public.orders'::regclass) then
        raise exception 'anvaya-check-setup' using detail = format('not running as the owner of the order tables (running as %s)', current_user);
      end if;
      if step ? 'sub' and auth.uid()::text is distinct from step ->> 'sub' then
        raise exception 'anvaya-check-setup' using detail = format('signed-in user is %s, not %s', auth.uid(), step ->> 'sub');
      end if;
      execute step ->> 'sql' into result;
    end loop;
    raise exception 'anvaya-check-rollback' using detail = coalesce(result, '(no result)');
  exception when others then
    if sqlerrm in ('anvaya-check-rollback', 'anvaya-check-setup') then
      get stacked diagnostics result = pg_exception_detail;
      if sqlerrm = 'anvaya-check-setup' then
        result := 'SETUP FAILED: ' || result;
      end if;
    else
      result := 'ERROR: ' || sqlerrm;
    end if;
  end;
  if current_user <> caller then
    return 'SETUP FAILED: role not restored (running as ' || current_user || ')';
  end if;
  return result;
end;
$$;

select section, no, check_name, outcome, detail from (
with
pick as ( -- an enabled kurta size with at least 2 in stock
  select s.product_id as id, s.size, coalesce(p.sale_price, p.price) as unit
  from public.product_stock s join public.products p on p.id = s.product_id
  where p.status = 'enabled' and p.category = 'Kurtas' and s.quantity >= 2
  order by p.id, s.size limit 1
),
saree as (select id from public.products where category = 'Sarees' order by id limit 1),
admin as (select user_id::text as sub from public.admin_users order by created_at limit 1),
cfg as (select * from private.checkout_settings where id),
pct as (select * from public.offers where code = 'ALANKRITHA10'),
flat as (select * from public.offers where code = 'FESTIVE500'),
v as ( -- literals used to build the checks
  select pick.id, pick.size, pick.unit, saree.id as saree_id, admin.sub as admin_sub,
         gen_random_uuid()::text as stranger_sub,
         cfg.free_shipping_threshold as threshold, cfg.standard_shipping_fee as fee,
         format('jsonb_build_array(jsonb_build_object(%L, %L, %L, %L, %L, %%s))', 'product_id', pick.id, 'size', pick.size, 'quantity') as items_tpl,
         '''{"name":"LIVE CHECK","phone":"9000000001","address":"Placeholder address 1","city":"Bengaluru","state":"Karnataka","pincode":"560001"}''::jsonb' as cust,
         pct.value as pct_value, pct.min_spend as pct_min, flat.value as flat_value, flat.min_spend as flat_min
  from pick, saree, admin, cfg, pct, flat
),
e as ( -- expected figures for 2 units of the picked kurta
  select v.*, 2 * unit as sub2,
         case when 2 * unit >= pct_min then round(2 * unit * pct_value / 100.0)::int else 0 end as pct_disc2,
         case when 2 * unit >= threshold then 0 else fee end as ship2,
         case when unit >= threshold then 0 else fee end as ship1
  from v
),
checks (n, name, expected, steps) as (
  select 1, 'visitor cannot read orders', '^ERROR: permission denied for table orders$', jsonb_build_array(jsonb_build_object('role', 'anon', 'sql', 'select count(*)::text from public.orders')) from e
  union all select 2, 'visitor cannot read order items', '^ERROR: permission denied for table order_items$', jsonb_build_array(jsonb_build_object('role', 'anon', 'sql', 'select count(*)::text from public.order_items')) from e
  union all select 3, 'visitor cannot read coupons', '^ERROR: permission denied for table offers$', jsonb_build_array(jsonb_build_object('role', 'anon', 'sql', 'select count(*)::text from public.offers')) from e
  union all select 4, 'visitor cannot read checkout settings', '^ERROR: permission denied for schema private$', jsonb_build_array(jsonb_build_object('role', 'anon', 'sql', 'select count(*)::text from private.checkout_settings')) from e
  union all select 5, 'visitor cannot insert an order', '^ERROR: permission denied for table orders$', jsonb_build_array(jsonb_build_object('role', 'anon', 'sql', 'insert into public.orders (reference) values (''x'') returning id::text')) from e
  union all select 6, 'visitor cannot change stock', '^ERROR: permission denied for table product_stock$', jsonb_build_array(jsonb_build_object('role', 'anon', 'sql', 'update public.product_stock set quantity = 99 returning quantity::text')) from e
  union all select 7, 'visitor cannot call the admin function', '^ERROR: permission denied for function admin_update_order_status$', jsonb_build_array(jsonb_build_object('role', 'anon', 'sql', 'select public.admin_update_order_status(gen_random_uuid(), ''Cancelled'', null)::text')) from e
  union all select 8, 'visitor cannot call private helpers', '^ERROR: permission denied for schema private$', jsonb_build_array(jsonb_build_object('role', 'anon', 'sql', 'select private.apply_order_status(gen_random_uuid(), ''Cancelled'', null)::text')) from e
  union all select 9, 'non-admin sees no orders, even one just placed', '^0$', jsonb_build_array(
      jsonb_build_object('role', 'anon', 'sql', format('select public.place_order(%L, %s, %s, null, %s)::text', gen_random_uuid(), format(items_tpl, 1), cust, unit + ship1)),
      jsonb_build_object('role', 'owner', 'sql', 'select case when count(*) > 0 then 1 end::text from public.orders'),
      jsonb_build_object('role', 'authenticated', 'sub', stranger_sub, 'sql', 'select count(*)::text from public.orders')) from e
  union all select 10, 'non-admin refused by the admin function', '^ERROR: Only admins can update orders\.$', jsonb_build_array(jsonb_build_object('role', 'authenticated', 'sub', stranger_sub, 'sql', 'select public.admin_update_order_status(gen_random_uuid(), ''Cancelled'', null)::text')) from e
  union all select 11, 'non-admin cannot update orders directly', '^ERROR: permission denied for table orders$', jsonb_build_array(jsonb_build_object('role', 'authenticated', 'sub', stranger_sub, 'sql', 'update public.orders set status = ''Cancelled'' returning id::text')) from e
  union all select 12, 'quote: catalogue price x quantity and shipping', format('^%s/0/%s/%s$', sub2, ship2, sub2 + ship2), jsonb_build_array(jsonb_build_object('role', 'anon', 'sql',
      format('select concat_ws(''/'', q->''quote''->>''subtotal'', q->''quote''->>''discount'', q->''quote''->>''shipping'', q->''quote''->>''total'') from (select public.quote_order(%s, null) q) x', format(items_tpl, 2)))) from e
  union all select 13, 'quote: percent coupon applied by the database rules', format('^%s/%s/%s$', sub2, pct_disc2, sub2 - pct_disc2 + ship2), jsonb_build_array(jsonb_build_object('role', 'anon', 'sql',
      format('select concat_ws(''/'', q->''quote''->>''subtotal'', q->''quote''->>''discount'', q->''quote''->>''total'') from (select public.quote_order(%s, ''alankritha10'') q) x', format(items_tpl, 2)))) from e
  union all select 14, 'quote: flat coupon below its minimum spend gives no discount', case when unit >= flat_min then '^applied' else format('^below_min_spend/0/%s$', flat_min) end, jsonb_build_array(jsonb_build_object('role', 'anon', 'sql',
      format('select concat_ws(''/'', q->''quote''->>''coupon_status'', q->''quote''->>''discount'', q->''quote''->>''minimum_spend'') from (select public.quote_order(%s, ''FESTIVE500'') q) x', format(items_tpl, 1)))) from e
  union all select 15, 'quote: unknown coupon gives no discount and no details', '^invalid/0/$', jsonb_build_array(jsonb_build_object('role', 'anon', 'sql',
      format('select concat_ws(''/'', q->''quote''->>''coupon_status'', q->''quote''->>''discount'', coalesce(q->''quote''->>''minimum_spend'', '''')) from (select public.quote_order(%s, ''NOSUCHCODE1'') q) x', format(items_tpl, 1)))) from e
  union all select 16, 'place: order recorded, stock reduced once', '^ok/ANV-[0-9A-Z]{10}/reduced by 2$', jsonb_build_array(
      jsonb_build_object('role', 'owner', 'sql', format('select set_config(''anvaya.before'', quantity::text, true) from public.product_stock where product_id = %L and size = %L', id, size)),
      jsonb_build_object('role', 'anon', 'sql', format('select set_config(''anvaya.result'', public.place_order(''aaaaaaaa-0000-4000-8000-000000000016'', %s, %s, null, %s)::text, true)', format(items_tpl, 2), cust, sub2 + ship2)),
      jsonb_build_object('role', 'owner', 'sql', format('select concat(case when (current_setting(''anvaya.result'')::jsonb->>''ok'')::boolean then ''ok'' end, ''/'', current_setting(''anvaya.result'')::jsonb->''order''->>''reference'', ''/reduced by '', current_setting(''anvaya.before'')::int - quantity) from public.product_stock where product_id = %L and size = %L', id, size))) from e
  union all select 17, 'retry with same key and details returns the same order', '^replayed/same reference/reduced by 2$', jsonb_build_array(
      jsonb_build_object('role', 'owner', 'sql', format('select set_config(''anvaya.before'', quantity::text, true) from public.product_stock where product_id = %L and size = %L', id, size)),
      jsonb_build_object('role', 'anon', 'sql', format('select set_config(''anvaya.first'', public.place_order(''aaaaaaaa-0000-4000-8000-000000000017'', %s, %s, null, %s)::text, true)', format(items_tpl, 2), cust, sub2 + ship2)),
      jsonb_build_object('role', 'anon', 'sql', format('select set_config(''anvaya.second'', public.place_order(''aaaaaaaa-0000-4000-8000-000000000017'', %s, %s, null, %s)::text, true)', format(items_tpl, 2), cust, sub2 + ship2)),
      jsonb_build_object('role', 'owner', 'sql', format('select concat(case when (current_setting(''anvaya.second'')::jsonb->>''replayed'')::boolean then ''replayed'' end, ''/'', case when current_setting(''anvaya.first'')::jsonb->''order''->>''reference'' = current_setting(''anvaya.second'')::jsonb->''order''->>''reference'' then ''same reference'' end, ''/reduced by '', current_setting(''anvaya.before'')::int - quantity) from public.product_stock where product_id = %L and size = %L', id, size))) from e
  union all select 18, 'same key with different details is refused', '^idempotency_conflict/no order data$', jsonb_build_array(
      jsonb_build_object('role', 'anon', 'sql', format('select public.place_order(''aaaaaaaa-0000-4000-8000-000000000018'', %s, %s, null, %s)::text', format(items_tpl, 2), cust, sub2 + ship2)),
      jsonb_build_object('role', 'anon', 'sql', format('select concat(r->>''reason'', ''/'', case when r ? ''order'' then ''LEAKED'' else ''no order data'' end) from (select public.place_order(''aaaaaaaa-0000-4000-8000-000000000018'', %s, %s, null, %s) r) x', format(items_tpl, 1), cust, unit + ship1))) from e
  union all select 19, 'wrong expected total: nothing placed, new total returned', format('^price_changed/%s/0 orders$', sub2 + ship2), jsonb_build_array(
      jsonb_build_object('role', 'anon', 'sql', format('select set_config(''anvaya.result'', public.place_order(''aaaaaaaa-0000-4000-8000-000000000019'', %s, %s, null, 1)::text, true)', format(items_tpl, 2), cust)),
      jsonb_build_object('role', 'owner', 'sql', 'select concat(current_setting(''anvaya.result'')::jsonb->>''reason'', ''/'', current_setting(''anvaya.result'')::jsonb->''quote''->>''total'', ''/'', count(*), '' orders'') from public.orders where idempotency_key = ''aaaaaaaa-0000-4000-8000-000000000019''')) from e
  union all select 20, 'price changed after the quote: retry with the new total works', format('^price_changed/%s/ok$', 2 * (unit + 100) + case when 2 * (unit + 100) >= threshold then 0 else fee end), jsonb_build_array(
      jsonb_build_object('role', 'owner', 'sql', format('update public.products set price = price + 100, sale_price = sale_price + 100 where id = %L returning id', id)),
      jsonb_build_object('role', 'anon', 'sql', format('select set_config(''anvaya.first'', public.place_order(''aaaaaaaa-0000-4000-8000-000000000020'', %s, %s, null, %s)::text, true)', format(items_tpl, 2), cust, sub2 + ship2)),
      jsonb_build_object('role', 'anon', 'sql', format('select concat(current_setting(''anvaya.first'')::jsonb->>''reason'', ''/'', current_setting(''anvaya.first'')::jsonb->''quote''->>''total'', ''/'', case when (public.place_order(''aaaaaaaa-0000-4000-8000-000000000020'', %s, %s, null, (current_setting(''anvaya.first'')::jsonb->''quote''->>''total'')::int)->>''ok'')::boolean then ''ok'' end)', format(items_tpl, 2), cust))) from e
  union all select 21, 'not enough stock: refused with the quantity left', '^unavailable/insufficient_stock/1$', jsonb_build_array(
      jsonb_build_object('role', 'owner', 'sql', format('update public.product_stock set quantity = 1 where product_id = %L and size = %L returning quantity::text', id, size)),
      jsonb_build_object('role', 'anon', 'sql', format('select concat(r->>''reason'', ''/'', r->''problems''->0->>''problem'', ''/'', r->''problems''->0->>''available'') from (select public.place_order(gen_random_uuid(), %s, %s, null, %s) r) x', format(items_tpl, 2), cust, sub2 + ship2))) from e
  union all select 22, 'hidden product: refused without its name', '^unavailable/not_available/name hidden$', jsonb_build_array(
      jsonb_build_object('role', 'owner', 'sql', format('update public.products set status = ''disabled'' where id = %L returning id', id)),
      jsonb_build_object('role', 'anon', 'sql', format('select concat(r->>''reason'', ''/'', r->''quote''->''problems''->0->>''problem'', ''/'', case when r->''quote''->''problems''->0->>''name'' is null then ''name hidden'' end) from (select public.quote_order(%s, null) r) x', format(items_tpl, 1)))) from e
  union all select 23, 'saree in a kurta size is refused', '^invalid_size$', jsonb_build_array(jsonb_build_object('role', 'anon', 'sql',
      format('select public.quote_order(jsonb_build_array(jsonb_build_object(''product_id'', %L, ''size'', ''M'', ''quantity'', 1)), null)->''quote''->''problems''->0->>''problem''', saree_id))) from e
  union all select 24, 'more than 10 of one piece is refused', '^quantity_limit$', jsonb_build_array(jsonb_build_object('role', 'anon', 'sql', format('select public.quote_order(%s, null)->>''reason''', format(items_tpl, 11)))) from e
  union all select 25, '4th pending order for one phone in 24 h is refused', '^ok,ok,ok,too_many_pending$', jsonb_build_array(
      jsonb_build_object('role', 'owner', 'sql', format('update public.product_stock set quantity = 10 where product_id = %L and size = %L returning quantity::text', id, size)),
      jsonb_build_object('role', 'anon', 'sql', format('select string_agg(coalesce(r->>''reason'', ''ok''), '','' order by i) from (select i, public.place_order(gen_random_uuid(), %s, ''{"name":"LIVE CHECK","phone":"+91 90000 00025","address":"Placeholder address 1","city":"Bengaluru","state":"Karnataka","pincode":"560001"}''::jsonb, null, %s) r from generate_series(1, 4) i) x', format(items_tpl, 1), unit + ship1))) from e
  union all select 26, 'admin: Pending to Shipped is refused, Paid refused before delivery', '^invalid_transition/invalid_payment$', jsonb_build_array(
      jsonb_build_object('role', 'anon', 'sql', format('select public.place_order(''aaaaaaaa-0000-4000-8000-000000000026'', %s, %s, null, %s)::text', format(items_tpl, 1), cust, unit + ship1)),
      jsonb_build_object('role', 'authenticated', 'sub', admin_sub, 'sql', 'select concat(public.admin_update_order_status(o.id, ''Shipped'', null)->>''reason'', ''/'', public.admin_update_order_status(o.id, null, ''Paid'')->>''reason'') from public.orders o where o.idempotency_key = ''aaaaaaaa-0000-4000-8000-000000000026''')) from e
  union all select 27, 'admin: cancel restores stock exactly once', '^changed/unchanged/back to start$', jsonb_build_array(
      jsonb_build_object('role', 'owner', 'sql', format('select set_config(''anvaya.before'', quantity::text, true) from public.product_stock where product_id = %L and size = %L', id, size)),
      jsonb_build_object('role', 'anon', 'sql', format('select public.place_order(''aaaaaaaa-0000-4000-8000-000000000027'', %s, %s, null, %s)::text', format(items_tpl, 2), cust, sub2 + ship2)),
      jsonb_build_object('role', 'authenticated', 'sub', admin_sub, 'sql', 'select set_config(''anvaya.first'', public.admin_update_order_status((select id from public.orders where idempotency_key = ''aaaaaaaa-0000-4000-8000-000000000027''), ''Cancelled'', null)::text, true)'),
      jsonb_build_object('role', 'authenticated', 'sub', admin_sub, 'sql', 'select set_config(''anvaya.second'', public.admin_update_order_status((select id from public.orders where idempotency_key = ''aaaaaaaa-0000-4000-8000-000000000027''), ''Cancelled'', null)::text, true)'),
      jsonb_build_object('role', 'owner', 'sql', format('select concat(case when (current_setting(''anvaya.first'')::jsonb->>''changed'')::boolean then ''changed'' end, ''/'', case when not (current_setting(''anvaya.second'')::jsonb->>''changed'')::boolean then ''unchanged'' end, ''/'', case when quantity = current_setting(''anvaya.before'')::int then ''back to start'' else ''stock '' || quantity end) from public.product_stock where product_id = %L and size = %L', id, size))) from e
  union all select 28, 'admin: delivered stays unpaid until marked; return restores once and allows refund', '^COD - Due/Paid/Returned,Refunded/back to start$', jsonb_build_array(
      jsonb_build_object('role', 'owner', 'sql', format('select set_config(''anvaya.before'', quantity::text, true) from public.product_stock where product_id = %L and size = %L', id, size)),
      jsonb_build_object('role', 'anon', 'sql', format('select public.place_order(''aaaaaaaa-0000-4000-8000-000000000028'', %s, %s, null, %s)::text', format(items_tpl, 1), cust, unit + ship1)),
      jsonb_build_object('role', 'authenticated', 'sub', admin_sub, 'sql', 'select concat_ws(''/'',
          (select public.admin_update_order_status(id, ''Confirmed'', null)->>''ok'' from public.orders where idempotency_key = ''aaaaaaaa-0000-4000-8000-000000000028''),
          (select public.admin_update_order_status(id, ''Shipped'', null)->>''ok'' from public.orders where idempotency_key = ''aaaaaaaa-0000-4000-8000-000000000028''),
          set_config(''anvaya.delivered'', (select public.admin_update_order_status(id, ''Delivered'', null)->>''payment_status'' from public.orders where idempotency_key = ''aaaaaaaa-0000-4000-8000-000000000028''), true))'),
      jsonb_build_object('role', 'authenticated', 'sub', admin_sub, 'sql', 'select set_config(''anvaya.paid'', (select public.admin_update_order_status(id, null, ''Paid'')->>''payment_status'' from public.orders where idempotency_key = ''aaaaaaaa-0000-4000-8000-000000000028''), true)'),
      jsonb_build_object('role', 'authenticated', 'sub', admin_sub, 'sql', 'select set_config(''anvaya.returned'', (select concat(r->>''status'', '','', r->>''payment_status'') from public.orders o, lateral (select public.admin_update_order_status(o.id, ''Returned'', ''Refunded'') r) x where o.idempotency_key = ''aaaaaaaa-0000-4000-8000-000000000028''), true)'),
      jsonb_build_object('role', 'authenticated', 'sub', admin_sub, 'sql', 'select public.admin_update_order_status(id, ''Returned'', null)::text from public.orders where idempotency_key = ''aaaaaaaa-0000-4000-8000-000000000028'''),
      jsonb_build_object('role', 'owner', 'sql', format('select concat(current_setting(''anvaya.delivered''), ''/'', current_setting(''anvaya.paid''), ''/'', current_setting(''anvaya.returned''), ''/'', case when quantity = current_setting(''anvaya.before'')::int then ''back to start'' else ''stock '' || quantity end) from public.product_stock where product_id = %L and size = %L', id, size))) from e
),
prereq (n, name, expected, result) as (
  select 1, 'runs as the owner of the order tables', '^yes$',
         case when current_user::text = (select pg_get_userbyid(relowner)::text from pg_class where oid = 'public.orders'::regclass)
              then 'yes' else 'no: running as ' || current_user end
  union all select 2, 'can act as a visitor (anon)', '^anon$',
         pg_temp.run_check('[{"role": "anon", "sql": "select current_user::text"}]')
  union all select 3, 'can act as a signed-in user', '^authenticated$',
         pg_temp.run_check(jsonb_build_array(jsonb_build_object('role', 'authenticated', 'sub', gen_random_uuid()::text, 'sql', 'select current_user::text')))
  union all select 4, 'an admin account exists and is recognised as admin', '^true$',
         coalesce((select pg_temp.run_check(jsonb_build_array(jsonb_build_object('role', 'authenticated', 'sub', sub, 'sql', 'select public.is_admin()::text'))) from admin),
                  'no row in public.admin_users')
  union all select 5, 'a published kurta size has 2 or more in stock', '^yes$',
         case when exists (select 1 from pick) then 'yes' else 'none found' end
  union all select 6, 'a saree exists', '^yes$', case when exists (select 1 from saree) then 'yes' else 'none found' end
  union all select 7, 'coupons ALANKRITHA10 and FESTIVE500 exist', '^yes$',
         case when exists (select 1 from pct) and exists (select 1 from flat) then 'yes' else 'missing' end
  union all select 8, 'checkout settings row exists', '^yes$', case when exists (select 1 from cfg) then 'yes' else 'missing' end
),
results as (
  select n, name, expected, r.result
  from checks, lateral (select pg_temp.run_check(steps) as result) r
)
select 1 as sort, 'prerequisite' as section, n as no, name as check_name,
       case when result ~ expected then 'PASS' else 'FAIL' end as outcome, result as detail
from prereq
union all
select 2, 'check', n, name, case when result ~ expected then 'PASS' else 'FAIL' end, result
from results
union all
select 3, 'summary', 99, 'all prerequisites and all 28 checks passed',
       case when (select count(*) from prereq where result ~ expected) = 8
             and (select count(*) from results where result ~ expected) = 28 then 'PASS' else 'FAIL' end,
       format('%s of 8 prerequisites passed; %s of 28 checks ran, %s passed',
              (select count(*) from prereq where result ~ expected),
              (select count(*) from results), (select count(*) from results where result ~ expected))
) report
order by sort, no;
