-- Impede referências entre usuários diferentes mesmo com UUIDs externos.
alter table public.routes
  add constraint routes_id_user_unique unique (id, user_id);
alter table public.leads
  add constraint leads_id_user_unique unique (id, user_id);

alter table public.route_stops
  add constraint stops_route_owner_fk
  foreign key (route_id, user_id)
  references public.routes (id, user_id)
  on delete cascade;

alter table public.route_stops
  add constraint stops_lead_owner_fk
  foreign key (lead_id, user_id)
  references public.leads (id, user_id)
  on delete set null (lead_id);

create index if not exists stops_lead_idx
  on public.route_stops (lead_id)
  where lead_id is not null;
