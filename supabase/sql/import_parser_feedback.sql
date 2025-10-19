-- Schema definition for storing parser feedback that is created when manual
-- product assignments are saved inside the import wizard.
--
-- Run this in your Supabase project once. It creates the table together with
-- a deterministic uniqueness constraint (used by the upsert in the edge
-- function) and grants authenticated users the ability to read and write the
-- feedback via RLS policies.

create table if not exists public.import_parser_feedback (
  supplier text not null,
  detected_description text not null,
  detected_sku text,
  assigned_product_id bigint references public.products(id) on delete set null,
  assigned_product_sku text,
  assigned_product_name text,
  assigned_uom text check (assigned_uom in ('KG','TU','STUECK')),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists import_parser_feedback_unique
  on public.import_parser_feedback (supplier, detected_description, detected_sku);

alter table public.import_parser_feedback enable row level security;

drop policy if exists "import_parser_feedback_select" on public.import_parser_feedback;
create policy "import_parser_feedback_select"
  on public.import_parser_feedback
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "import_parser_feedback_insert" on public.import_parser_feedback;
create policy "import_parser_feedback_insert"
  on public.import_parser_feedback
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "import_parser_feedback_update" on public.import_parser_feedback;
create policy "import_parser_feedback_update"
  on public.import_parser_feedback
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
