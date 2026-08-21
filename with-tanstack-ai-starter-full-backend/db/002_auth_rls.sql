-- Phase 1: per-user ownership + RLS + the Data API vector-search RPC.
-- Neon Auth issues a JWT whose `sub` claim is the user id, read by auth.user_id(),
-- and the Data API runs requests as the `authenticated` role. Every policy
-- below scopes rows to auth.user_id(), so the browser can query Postgres
-- directly and only ever see its owner's photos.

-- 1. Ownership column. Nullable so any pre-existing rows survive. The
--    seed/backfill assigns them to the demo account, then app inserts always set it.
alter table photos add column if not exists owner_id text;
create index if not exists photos_owner_idx on photos (owner_id);

-- 2. Row-level security.
alter table photos enable row level security;

drop policy if exists photos_select_own on photos;
drop policy if exists photos_insert_own on photos;
drop policy if exists photos_update_own on photos;
drop policy if exists photos_delete_own on photos;

create policy photos_select_own on photos
  for select to authenticated using (owner_id = auth.user_id());
create policy photos_insert_own on photos
  for insert to authenticated with check (owner_id = auth.user_id());
create policy photos_update_own on photos
  for update to authenticated using (owner_id = auth.user_id()) with check (owner_id = auth.user_id());
create policy photos_delete_own on photos
  for delete to authenticated using (owner_id = auth.user_id());

-- 3. Grants: the browser reaches the Data API as `authenticated`, and it only
--    ever READS (index.tsx uses .select()/.rpc() exclusively). Every write goes
--    through a server route on the owner connection, so the Data API role needs
--    SELECT only. Granting insert/update/delete here would let a signed-in user
--    forge/mutate/delete rows in their own library straight through PostgREST,
--    bypassing the server-side embedding + storage pipeline. RLS would still block
--    cross-tenant writes, but least privilege keeps this surface closed entirely.
grant usage on schema public to authenticated;
revoke insert, update, delete on photos from authenticated;  -- tighten existing deployments
grant select on photos to authenticated;

-- query_embeddings is a shared text->vector cache, written only by the owner
-- connection. Neon's Data API sets a default privilege that auto-grants CRUD to
-- `authenticated` on every new table, so revoke it here and enable RLS with no
-- policy: two independent reasons it fails closed to the browser. The owner
-- connection bypasses RLS and keeps writing the cache.
revoke all on query_embeddings from authenticated;
alter table query_embeddings enable row level security;

-- 4. Vector-search RPC, exposed by the Data API as POST /rpc/match_photos.
--    SECURITY INVOKER (the default) means the caller's RLS applies, so the ANN
--    scan only ever ranks the caller's own photos. PostgREST can't express a
--    `<=>` ORDER BY inline, so this function is how vector search reaches the
--    Data API. The embedding arrives as a JSON array string and is cast to vector.
create or replace function public.match_photos(query_embedding text, match_count int default 24)
returns table (id text, filename text, caption text, width int, height int, distance float)
language sql
stable
security invoker
as $$
  select p.id, p.filename, p.caption, p.width, p.height,
         (p.embedding <=> query_embedding::vector) as distance
  from photos p
  order by p.embedding <=> query_embedding::vector
  limit match_count
$$;

grant execute on function public.match_photos(text, int) to authenticated;
