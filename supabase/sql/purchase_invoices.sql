-- Schema for purchase related data structures (suppliers, invoices, items,
-- price history and surcharge settings).
-- Run once in Supabase to create the tables and basic RLS policies so authenticated
-- users can view, insert and adjust records.

create or replace function public.set_timestamps()
returns trigger as
$$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

-- Suppliers -------------------------------------------------------------------
create table if not exists public.suppliers (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.suppliers enable row level security;

drop policy if exists "suppliers_select" on public.suppliers;
create policy "suppliers_select"
  on public.suppliers
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "suppliers_insert" on public.suppliers;
create policy "suppliers_insert"
  on public.suppliers
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "suppliers_update" on public.suppliers;
create policy "suppliers_update"
  on public.suppliers
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Products --------------------------------------------------------------------
create table if not exists public.products (
  id bigint generated always as identity primary key,
  sku text not null unique,
  name text not null,
  ean text unique,
  supplier_item_number text,
  category text,
  base_uom text not null default 'piece' check (base_uom in ('piece', 'kg')),
  pieces_per_tu numeric(12,4),
  units_per_carton numeric(12,4),
  cartons_per_palette numeric(12,4),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.products enable row level security;

drop policy if exists "products_select" on public.products;
create policy "products_select"
  on public.products
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "products_insert" on public.products;
create policy "products_insert"
  on public.products
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "products_update" on public.products;
create policy "products_update"
  on public.products
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Purchase invoices -----------------------------------------------------------
create table if not exists public.purchase_invoices (
  id bigint generated always as identity primary key,
  supplier_id bigint not null references public.suppliers(id) on delete restrict,
  invoice_no text not null,
  invoice_date date,
  currency text not null default 'EUR',
  net_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists purchase_invoices_supplier_invoice_unique
  on public.purchase_invoices (supplier_id, invoice_no);

drop trigger if exists purchase_invoices_set_updated on public.purchase_invoices;

create trigger purchase_invoices_set_updated
  before update on public.purchase_invoices
  for each row
  execute function public.set_timestamps();

alter table public.purchase_invoices enable row level security;

drop policy if exists "purchase_invoices_select" on public.purchase_invoices;
create policy "purchase_invoices_select"
  on public.purchase_invoices
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "purchase_invoices_insert" on public.purchase_invoices;
create policy "purchase_invoices_insert"
  on public.purchase_invoices
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "purchase_invoices_update" on public.purchase_invoices;
create policy "purchase_invoices_update"
  on public.purchase_invoices
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Purchase invoice items ------------------------------------------------------
create table if not exists public.purchase_invoice_items (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references public.purchase_invoices(id) on delete cascade,
  product_id bigint references public.products(id) on delete set null,
  line_type text not null check (line_type in ('product', 'surcharge', 'shipping')),
  qty numeric(18,6) not null,
  uom text,
  unit_price_net numeric(18,6) not null,
  discount_abs numeric(18,6) not null default 0,
  tax_rate numeric(10,4) not null default 0,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists purchase_invoice_items_invoice_idx
  on public.purchase_invoice_items (invoice_id);

alter table public.purchase_invoice_items enable row level security;

drop policy if exists "purchase_invoice_items_select" on public.purchase_invoice_items;
create policy "purchase_invoice_items_select"
  on public.purchase_invoice_items
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "purchase_invoice_items_insert" on public.purchase_invoice_items;
create policy "purchase_invoice_items_insert"
  on public.purchase_invoice_items
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "purchase_invoice_items_update" on public.purchase_invoice_items;
create policy "purchase_invoice_items_update"
  on public.purchase_invoice_items
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Purchase price history ------------------------------------------------------
create table if not exists public.purchase_price_history (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  date_effective date not null,
  uom text not null check (uom in ('piece', 'kg')),
  price_per_base_unit_net numeric(18,6) not null,
  qty_in_base_units numeric(18,4),
  source_item_id bigint references public.purchase_invoice_items(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists purchase_price_history_product_date_idx
  on public.purchase_price_history (product_id, date_effective desc);

alter table public.purchase_price_history enable row level security;

drop policy if exists "purchase_price_history_select" on public.purchase_price_history;
create policy "purchase_price_history_select"
  on public.purchase_price_history
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "purchase_price_history_insert" on public.purchase_price_history;
create policy "purchase_price_history_insert"
  on public.purchase_price_history
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "purchase_price_history_update" on public.purchase_price_history;
create policy "purchase_price_history_update"
  on public.purchase_price_history
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Supplier specific surcharge policies ---------------------------------------
create table if not exists public.settings_cost_allocation (
  id bigint generated always as identity primary key,
  supplier_id bigint not null references public.suppliers(id) on delete cascade,
  active_from date not null,
  policy text not null check (policy in ('none', 'per_kg', 'per_piece')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists settings_cost_allocation_supplier_active_idx
  on public.settings_cost_allocation (supplier_id, active_from desc);

alter table public.settings_cost_allocation enable row level security;

drop policy if exists "settings_cost_allocation_select" on public.settings_cost_allocation;
create policy "settings_cost_allocation_select"
  on public.settings_cost_allocation
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "settings_cost_allocation_insert" on public.settings_cost_allocation;
create policy "settings_cost_allocation_insert"
  on public.settings_cost_allocation
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "settings_cost_allocation_update" on public.settings_cost_allocation;
create policy "settings_cost_allocation_update"
  on public.settings_cost_allocation
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

