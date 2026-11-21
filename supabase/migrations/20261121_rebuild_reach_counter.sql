-- Fix the homepage visitor counter (site/index.html -> rpc('increment_reach')).
-- Existing table public.site_stats is key/value: (key text, value bigint, updated_at timestamptz).
-- The counter lives in the row with key = 'reach_count'.
-- Idempotent and non-destructive: never resets an existing count.
-- Run in Supabase Dashboard -> SQL Editor.

create or replace function public.increment_reach()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_val bigint;
begin
  update public.site_stats
     set value = value + 1,
         updated_at = now()
   where key = 'reach_count'
  returning value into new_val;

  if not found then
    insert into public.site_stats (key, value, updated_at)
    values ('reach_count', 1, now())
    returning value into new_val;
  end if;

  return new_val;
end;
$$;

revoke all on function public.increment_reach() from public;
grant execute on function public.increment_reach() to anon, authenticated;
