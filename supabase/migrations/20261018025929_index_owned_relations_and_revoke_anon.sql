-- Índices para FKs compostas e revogação de acesso ao papel não autenticado.
create index if not exists stops_route_owner_idx
  on public.route_stops (route_id, user_id);
create index if not exists stops_lead_owner_idx
  on public.route_stops (lead_id, user_id)
  where lead_id is not null;

revoke all on table public.leads, public.routes, public.route_stops from anon;
