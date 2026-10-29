# Live Supabase verification (project pmwblihxpujpbevjpmfx)

Checked on 2026-10-29 through the Supabase connector, with read-only catalog queries and
role checks run inside one transaction that was rolled back. No orders were placed, and no
data, schema, policy or grant was changed. No personal data was read.

## PASS (confirmed against the live database)

- **Tables:** all eight exist with Row Level Security on.
  - `public`: `admin_users`, `products`, `product_stock`, `product_reviews`, `offers`, `orders`, `order_items`.
  - `private`: `checkout_settings`.
  - Row counts: 2 admins, 18 products, 58 stock rows, 2 reviews, 2 offers, 0 orders.
- **Functions:** all 13 functions in `products_schema.sql` and `orders_schema.sql` match the
  live database, including `quote_order`, `place_order`, `admin_update_order_status`,
  `is_admin` and the private helpers.
  - Function bodies match byte for byte after whitespace normalisation (md5 compared).
  - Signatures, SECURITY DEFINER, `search_path = ''` and `lock_timeout = 2s` also match.
- **Execute grants:**
  - `quote_order` and `place_order`: visitors and signed-in users.
  - `admin_update_order_status`: signed-in users only, and it checks `is_admin()` inside.
  - `private.*` functions: no API role.
- **Table grants and policies match the drafts.**
  - Visitors can only read published products, their stock and their reviews.
  - Orders, order items and offers are readable by admins only.
  - Products, stock and reviews can be changed by admins only.
- **Constraints:**
  - `product_stock.quantity >= 0`.
  - Order totals must add up.
  - `ANV-` reference format, plus unique reference and unique idempotency key.
  - Phone, PIN and status checks.
- **Checkout settings and offers:**
  - Settings: free shipping from ₹1,999, ₹99 otherwise, at most 10 per line and 20 lines, 3 pending orders per phone in 24 hours.
  - Offers: `ALANKRITHA10` and `FESTIVE500`. These match `src/config.ts` and `src/services/offerService.ts`.
- **Role checks (rolled back):**
  - A visitor is denied reading `orders`, `order_items`, `offers`, `checkout_settings` and `admin_users`, and denied calling the admin and private functions.
  - A visitor is denied updating products, and `is_admin()` returns false for a visitor.
  - A signed-in non-admin gets `is_admin()` = false, sees 0 offers, is denied `admin_users`, and can update 0 product rows and 0 stock rows.
  - A signed-in non-admin is refused by `admin_update_order_status` ("Only admins can update orders.").
  - Both admin accounts exist in `auth.users`, and `is_admin()` returns true for each.
  - Both admins can see the offers, and both can call `admin_update_order_status` (on a missing order it answers `not_found`).
- **Live call from the website:** `rpc/quote_order` with the publishable key returned 200, and checkout showed the database's figures.

## NOT VERIFIED (each needs a controlled write to the live database)

- **Placing a real order:** the order is saved, stock goes down, and retrying with the same key returns the same order.
- **Cancelling or returning:** stock is restored exactly once.
- **Two simultaneous orders for the last unit:** whether the stock-row lock serialises them.
  - The code takes `FOR UPDATE` locks in a fixed order, and the `quantity >= 0` constraint
    rejects any negative stock, but the timing has not been exercised.
- **Real admin sign-in in the browser** with each admin's own password.
- **`supabase/drafts/orders_live_checks.sql`:** not run.
  - It saves nothing (each check is rolled back), but it does call `place_order` and change stock inside its transactions.
  - So it needs the owner's go-ahead.

## Advisor notes (Supabase linter)

- **SECURITY DEFINER functions callable from the API.** `quote_order`, `place_order`, `is_admin` and `admin_update_order_status` are intended to be.
- **`public.rls_auto_enable()`** is callable by `anon` and `authenticated`.
  - It is Supabase's event-trigger helper for the `ensure_rls` event trigger, returns `event_trigger`, and cannot be run through a direct call.
  - Optional hardening (needs approval): `revoke execute on function public.rls_auto_enable() from anon, authenticated;`
- **Leaked password protection is off.** Turn it on in the Auth settings (dashboard).
- **`order_items.product_id` has no index** (performance only).
  - Optional: `create index if not exists order_items_product_idx on public.order_items (product_id);`
