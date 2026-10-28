-- ANVAYA products schema
-- Run the whole file in the Supabase SQL Editor (nothing selected), then run products_seed.sql.
-- All or nothing: if any statement fails, nothing is created.
-- Safe to run again: it never drops tables or deletes rows; it only adds what is
-- missing and re-creates the functions, trigger and policies below.
-- Success shows a table of the four tables with rls_enabled = true for each.

begin;

-- ---------------------------------------------------------------------------
-- Admins: Supabase Auth users who may edit the catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- RLS on with no policies, and no API access: admins are added by hand in the SQL Editor
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- Products (mirrors the Product type in src/types.ts)
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id text primary key, -- keeps existing ids such as "alk-001"
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  collection text not null check (collection in ('alankritha', 'ayanaa')),
  category text not null check (category in ('Kurtas', 'Sarees')),
  subcategory text,
  price integer not null check (price > 0), -- whole rupees
  sale_price integer,
  image text not null,
  additional_images text[] not null default '{}',
  is_featured boolean not null default false,
  is_new_arrival boolean not null default false,
  status text not null default 'enabled' check (status in ('enabled', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_sale_price_valid check (sale_price is null or (sale_price > 0 and sale_price <= price)),
  -- Alankritha is kurtas only, Ayanaa is sarees only
  constraint products_collection_matches_category check (
    (category = 'Kurtas' and collection = 'alankritha')
    or (category = 'Sarees' and collection = 'ayanaa')
  )
);

create index if not exists products_collection_status_idx on public.products (collection, status);

-- ---------------------------------------------------------------------------
-- Stock per size (one row per product and size, never below zero)
-- Sizes match src/utils/sizes.ts: kurtas S to XXL, sarees Free Size
-- ---------------------------------------------------------------------------
create table if not exists public.product_stock (
  product_id text not null references public.products (id) on delete cascade,
  size text not null check (size in ('S', 'M', 'L', 'XL', 'XXL', 'Free Size')),
  quantity integer not null default 0 check (quantity >= 0),
  primary key (product_id, size)
);

-- ---------------------------------------------------------------------------
-- Reviews (limits match the review checks in server.ts)
-- ---------------------------------------------------------------------------
create table if not exists public.product_reviews (
  id text primary key default gen_random_uuid()::text, -- keeps "rev-01" style ids
  product_id text not null references public.products (id) on delete cascade,
  author text not null check (length(trim(author)) between 1 and 80),
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (length(comment) <= 2000),
  review_date date not null default current_date,
  verified boolean not null default false,
  brand_reply text
);

create index if not exists product_reviews_product_idx on public.product_reviews (product_id);

-- ---------------------------------------------------------------------------
-- Keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Visitors (anon): read published products, their stock and reviews. No writes.
-- Admins (signed in and listed in admin_users): full access.
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.product_stock enable row level security;
alter table public.product_reviews enable row level security;

grant select on public.products, public.product_stock, public.product_reviews to anon, authenticated;
grant insert, update, delete on public.products, public.product_stock, public.product_reviews to authenticated;
revoke insert, update, delete on public.products, public.product_stock, public.product_reviews from anon;

drop policy if exists "Anyone can read published products" on public.products;
create policy "Anyone can read published products"
on public.products for select to anon, authenticated
using (status = 'enabled');

drop policy if exists "Admins can read all products" on public.products;
create policy "Admins can read all products"
on public.products for select to authenticated
using ((select public.is_admin()));

drop policy if exists "Admins can add products" on public.products;
create policy "Admins can add products"
on public.products for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists "Admins can edit products" on public.products;
create policy "Admins can edit products"
on public.products for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products"
on public.products for delete to authenticated
using ((select public.is_admin()));

drop policy if exists "Anyone can read stock of published products" on public.product_stock;
create policy "Anyone can read stock of published products"
on public.product_stock for select to anon, authenticated
using (exists (select 1 from public.products p where p.id = product_stock.product_id and p.status = 'enabled'));

drop policy if exists "Admins can manage stock" on public.product_stock;
create policy "Admins can manage stock"
on public.product_stock for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Anyone can read reviews of published products" on public.product_reviews;
create policy "Anyone can read reviews of published products"
on public.product_reviews for select to anon, authenticated
using (exists (select 1 from public.products p where p.id = product_reviews.product_id and p.status = 'enabled'));

drop policy if exists "Admins can manage reviews" on public.product_reviews;
create policy "Admins can manage reviews"
on public.product_reviews for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

commit;

-- Let the Supabase API see the new tables straight away
notify pgrst, 'reload schema';

-- Confirmation: should list admin_users, product_reviews, product_stock, products
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('admin_users', 'products', 'product_stock', 'product_reviews')
order by c.relname;
