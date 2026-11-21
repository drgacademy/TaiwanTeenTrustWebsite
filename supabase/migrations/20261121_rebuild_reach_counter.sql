-- Rebuild the homepage visitor counter (site/index.html -> rpc('increment_reach')).
-- Idempotent: safe to run on a project where parts already exist.
-- Run in Supabase Dashboard -> SQL Editor.

create table if not exists public.site_stats (
  id          int primary key default 1,
  reach_count bigint not null default 0,
  constraint site_stats_single_row check (id = 1)
);

-- In case the table existed without the column.
alter table public.site_stats add column if not exists reach_count bigint not null default 0;

insert into public.site_stats (id, reach_count)
values (1, 0)
on conflict (id) do nothing;

-- Visitors can only read the counter; writes go through the RPC below.
alter table public.site_stats enable row level security;

drop policy if exists "site_stats public read" on public.site_stats;
create policy "site_stats public read"
  on public.site_stats for select
  to anon, authenticated
  using (true);

-- Atomically +1 and return the new value (the page expects a number).
create or replace function public.increment_reach()
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.site_stats
     set reach_count = reach_count + 1
   where id = 1
  returning reach_count;
$$;

revoke all on function public.increment_reach() from public;
grant execute on function public.increment_reach() to anon, authenticated;
