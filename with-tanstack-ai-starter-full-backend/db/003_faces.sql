-- Phase 2: face grouping ("people") on top of the photo library.
--
-- Faces are detected and embedded with @vladmandic/human: offline over the demo
-- library (scripts/faces.ts) and in the browser at upload time. Each face is a
-- 1024-d descriptor (faceres), grouped into people with Chinese Whispers
-- clustering (src/lib/cluster.ts). Everything is per-user: the same
-- owner_id = auth.user_id() RLS that scopes photos scopes faces and people too,
-- so the browser reads them straight from the Data API and only ever sees its own.

-- People (face clusters). Derived rows, rebuilt whenever the owner's faces change.
-- `last_face_at` is the newest face in the cluster; the UI orders circles by it so
-- freshly photographed people come first (created_at is just the rebuild time).
create table if not exists people (
  id           text primary key,
  owner_id     text not null,
  label        text,                            -- optional name; UI falls back to "Person N"
  cover_key    text,                            -- storage key of the representative face crop (the circle)
  face_count   int  not null default 0,
  last_face_at timestamptz,                     -- max(faces.created_at) in this cluster; recency for ordering
  created_at   timestamptz not null default now()
);
-- Add the column + backfill for databases created before recency ordering existed.
alter table people add column if not exists last_face_at timestamptz;
update people p
  set last_face_at = sub.max_created
  from (select person_id, max(created_at) as max_created from faces where person_id is not null group by person_id) sub
  where sub.person_id = p.id and p.last_face_at is distinct from sub.max_created;
create index if not exists people_owner_idx  on people (owner_id);
create index if not exists people_recent_idx on people (owner_id, last_face_at desc);

-- One row per detected face. `embedding` is a normalized 1024-d face descriptor;
-- `bbox` and `crop_key` locate/show the face; `person_id` is its cluster.
create table if not exists faces (
  id         text primary key,
  photo_id   text not null references photos(id) on delete cascade,
  owner_id   text not null,
  person_id  text references people(id) on delete set null,
  bbox       jsonb not null,                    -- [x, y, width, height] in source pixels
  crop_key   text not null,                     -- storage key of the cropped face jpeg
  score      real not null default 0,           -- detector confidence, used to pick a cover
  embedding  vector(1024) not null,
  created_at timestamptz not null default now()
);
create index if not exists faces_owner_idx  on faces (owner_id);
create index if not exists faces_photo_idx  on faces (photo_id);
create index if not exists faces_person_idx on faces (person_id);

-- Row-level security, mirroring photos.
alter table faces  enable row level security;
alter table people enable row level security;

drop policy if exists faces_select_own on faces;
drop policy if exists faces_insert_own on faces;
drop policy if exists faces_update_own on faces;
drop policy if exists faces_delete_own on faces;
create policy faces_select_own on faces for select to authenticated using (owner_id = auth.user_id());
create policy faces_insert_own on faces for insert to authenticated with check (owner_id = auth.user_id());
create policy faces_update_own on faces for update to authenticated using (owner_id = auth.user_id()) with check (owner_id = auth.user_id());
create policy faces_delete_own on faces for delete to authenticated using (owner_id = auth.user_id());

drop policy if exists people_select_own on people;
drop policy if exists people_insert_own on people;
drop policy if exists people_update_own on people;
drop policy if exists people_delete_own on people;
create policy people_select_own on people for select to authenticated using (owner_id = auth.user_id());
create policy people_insert_own on people for insert to authenticated with check (owner_id = auth.user_id());
create policy people_update_own on people for update to authenticated using (owner_id = auth.user_id()) with check (owner_id = auth.user_id());
create policy people_delete_own on people for delete to authenticated using (owner_id = auth.user_id());

-- Read-only through the Data API, mirroring photos: the browser only reads faces
-- and people (people list, photos_of_person), and all face writes go through
-- /api/faces on the owner connection. See the grant note in 002_auth_rls.sql.
revoke insert, update, delete on faces  from authenticated;  -- tighten existing deployments
revoke insert, update, delete on people from authenticated;
grant select on faces  to authenticated;
grant select on people to authenticated;

-- Every photo that contains a face in this person's cluster. SECURITY INVOKER, so
-- the caller's RLS scopes both sides of the join to their own rows: a person id
-- from another account simply matches nothing.
create or replace function public.photos_of_person(person_id text, match_count int default 200)
returns table (id text, filename text, caption text, width int, height int, distance float)
language sql
stable
security invoker
as $$
  select p.id, p.filename, p.caption, p.width, p.height, 0::float as distance
  from photos p
  where exists (
    select 1 from faces f
    where f.photo_id = p.id and f.person_id = photos_of_person.person_id
  )
  order by p.created_at desc
  limit match_count
$$;
grant execute on function public.photos_of_person(text, int) to authenticated;

-- Find-similar (neighbours) RPC. The client already calls this, and it is codified
-- here so the example is reproducible from the repo alone. Ranks the owner's
-- other photos by cosine distance to the given photo, excluding the photo itself.
drop function if exists public.neighbors_of(text, int);
create function public.neighbors_of(photo_id text, match_count int default 24)
returns table (id text, filename text, caption text, width int, height int, distance float)
language sql
stable
security invoker
as $$
  select p.id, p.filename, p.caption, p.width, p.height,
         (p.embedding <=> q.embedding) as distance
  from photos p, (select embedding from photos where id = photo_id) q
  where p.id <> photo_id
  order by p.embedding <=> q.embedding
  limit match_count
$$;
grant execute on function public.neighbors_of(text, int) to authenticated;

-- Note: identity search (find a person by a dropped photo) is not a Data API RPC.
-- The face vector is computed in the browser and ranked by /api/face-search on the
-- owner connection, so it is immediately consistent and never waits on a PostgREST
-- schema reload. Face grouping reads (people, photos_of_person) still go through
-- the Data API under RLS.

-- Tell the Data API (PostgREST) to pick up the new tables and functions.
notify pgrst, 'reload schema';
