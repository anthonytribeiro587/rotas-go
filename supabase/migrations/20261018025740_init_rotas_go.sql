-- Executar apenas no projeto Supabase do Rotas GO.
-- Nenhuma chave administrativa deve ir para o navegador.
create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default now()
);

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_point jsonb not null,
  end_point jsonb not null,
  geometry jsonb,
  distance_meters double precision,
  duration_seconds double precision,
  exact boolean,
  manual boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_key text not null,
  name text not null,
  address text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  position integer not null check (position >= 0),
  status text not null default 'pending' check (status in ('pending', 'visited', 'skipped')),
  visited_at timestamptz,
  unique(route_id, client_key),
  unique(route_id, position)
);

create index if not exists leads_user_idx on public.leads(user_id, created_at desc);
create index if not exists routes_user_idx on public.routes(user_id, created_at desc);
create index if not exists stops_route_idx on public.route_stops(route_id, position);
create index if not exists stops_user_idx on public.route_stops(user_id);

alter table public.leads enable row level security;
alter table public.routes enable row level security;
alter table public.route_stops enable row level security;

create policy "leads_select_own" on public.leads for select to authenticated using ((select auth.uid()) = user_id);
create policy "leads_insert_own" on public.leads for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "leads_update_own" on public.leads for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "leads_delete_own" on public.leads for delete to authenticated using ((select auth.uid()) = user_id);

create policy "routes_select_own" on public.routes for select to authenticated using ((select auth.uid()) = user_id);
create policy "routes_insert_own" on public.routes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "routes_update_own" on public.routes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "routes_delete_own" on public.routes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "stops_select_own" on public.route_stops for select to authenticated using ((select auth.uid()) = user_id);
create policy "stops_insert_own" on public.route_stops for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.routes r where r.id = route_id and r.user_id = (select auth.uid())
  ));
create policy "stops_update_own" on public.route_stops for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.routes r where r.id = route_id and r.user_id = (select auth.uid())
  ));
create policy "stops_delete_own" on public.route_stops for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.routes to authenticated;
grant select, insert, update, delete on public.route_stops to authenticated;
