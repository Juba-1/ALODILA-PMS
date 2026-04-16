-- Phase 11: Zero-touch owner onboarding — anonymous-safe lookup by national_id (SECURITY DEFINER).
-- Run after public.owners exists with column national_id.

create or replace function public.owner_lookup_for_onboarding(p_national_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_national_id is null or btrim(p_national_id) = '' then
    return null;
  end if;

  select o.id
    into v_id
  from public.owners o
  where o.is_deleted = false
    and o.national_id = btrim(p_national_id)
  limit 1;

  return v_id;
end;
$$;

revoke all on function public.owner_lookup_for_onboarding(text) from public;
grant execute on function public.owner_lookup_for_onboarding(text) to anon, authenticated;

comment on function public.owner_lookup_for_onboarding(text) is
  'Returns owners.id for trimmed national_id if active; used before first Auth signup. No PII beyond existence.';
