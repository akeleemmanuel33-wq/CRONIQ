
-- ============================================================
-- CRONIQ — RUN THIS IN SUPABASE SQL EDITOR 1
-- This is the ONLY file you need to run. It's safe to re-run.
-- Go to: Supabase Dashboard → SQL Editor → paste → Run All
-- ============================================================

-- Step 1: Drop everything and start clean
drop trigger  if exists on_auth_user_created         on auth.users;
drop trigger  if exists on_access_request_created    on access_requests;
drop trigger  if exists on_request_status_changed    on access_requests;
drop function if exists public.handle_new_user()        cascade;
drop function if exists public.handle_access_request()  cascade;
drop function if exists public.handle_request_status_change() cascade;
drop function if exists get_like_count(uuid)            cascade;
drop table    if exists comments         cascade;
drop table    if exists story_views      cascade;
drop table    if exists notifications    cascade;
drop table    if exists approved_access  cascade;
drop table    if exists access_requests  cascade;
drop table    if exists story_likes      cascade;
drop table    if exists stories          cascade;
drop table    if exists profiles         cascade;

-- Step 2: Create tables

create table profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  username    text unique not null,
  full_name   text default '',
  bio         text default '',
  avatar_url  text,
  created_at  timestamptz default now()
);

create table stories (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  title       text not null,
  content     text not null,
  excerpt     text,
  category    text not null default 'Reflection'
              check (category in ('Experience','Education','Reflection','Secret','Milestone','Lesson')),
  visibility  text not null default 'public'
              check (visibility in ('public','private','request')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table story_likes (
  id          uuid default gen_random_uuid() primary key,
  story_id    uuid references stories(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  created_at  timestamptz default now(),
  unique(story_id, user_id)
);

create table access_requests (
  id            uuid default gen_random_uuid() primary key,
  story_id      uuid references stories(id) on delete cascade not null,
  requester_id  uuid references profiles(id) on delete cascade not null,
  owner_id      uuid references profiles(id) on delete cascade not null,
  reason        text,
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected')),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(story_id, requester_id)
);

create table approved_access (
  id          uuid default gen_random_uuid() primary key,
  story_id    uuid references stories(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  granted_at  timestamptz default now(),
  unique(story_id, user_id)
);

create table comments (
  id          uuid default gen_random_uuid() primary key,
  story_id    uuid references stories(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  parent_id   uuid references comments(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 500),
  created_at  timestamptz default now()
);

create table notifications (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid references profiles(id) on delete cascade not null,
  type              text not null,
  message           text not null,
  related_story_id  uuid references stories(id) on delete cascade,
  related_user_id   uuid references profiles(id) on delete cascade,
  is_read           boolean default false,
  created_at        timestamptz default now()
);

-- Step 3: Enable Row Level Security
alter table profiles        enable row level security;
alter table stories         enable row level security;
alter table story_likes     enable row level security;
alter table access_requests enable row level security;
alter table approved_access enable row level security;
alter table comments        enable row level security;
alter table notifications   enable row level security;

-- Step 4: RLS Policies

-- PROFILES
create policy "profiles_select_all"   on profiles for select using (true);
create policy "profiles_insert_own"   on profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"   on profiles for update using (auth.uid() = id);

-- STORIES (no recursion — uses approved_access, not stories→stories)
create policy "stories_select" on stories for select using (
  auth.uid() = user_id
  or visibility = 'public'
  or (visibility = 'request' and exists (
    select 1 from approved_access aa
    where aa.story_id = stories.id and aa.user_id = auth.uid()
  ))
);
create policy "stories_insert_own"  on stories for insert with check (auth.uid() = user_id);
create policy "stories_update_own"  on stories for update using (auth.uid() = user_id);
create policy "stories_delete_own"  on stories for delete using (auth.uid() = user_id);

-- STORY LIKES
create policy "likes_select_all"  on story_likes for select using (true);
create policy "likes_insert_own"  on story_likes for insert with check (auth.uid() = user_id);
create policy "likes_delete_own"  on story_likes for delete using (auth.uid() = user_id);

-- ACCESS REQUESTS
create policy "requests_select"       on access_requests for select
  using (auth.uid() = requester_id or auth.uid() = owner_id);
create policy "requests_insert_own"   on access_requests for insert
  with check (auth.uid() = requester_id);
create policy "requests_update_owner" on access_requests for update
  using (auth.uid() = owner_id);

-- APPROVED ACCESS
create policy "approved_select_own" on approved_access for select
  using (auth.uid() = user_id);
create policy "approved_insert_owner" on approved_access for insert
  with check (exists (
    select 1 from stories s where s.id = story_id and s.user_id = auth.uid()
  ));

-- COMMENTS
create policy "comments_select_all"  on comments for select using (true);
create policy "comments_insert_own"  on comments for insert with check (auth.uid() = user_id);
create policy "comments_delete_own"  on comments for delete using (auth.uid() = user_id);

-- NOTIFICATIONS
create policy "notif_select_own"  on notifications for select using (auth.uid() = user_id);
create policy "notif_insert_all"  on notifications for insert with check (true);
create policy "notif_update_own"  on notifications for update using (auth.uid() = user_id);

-- Step 5: Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger as $$
declare
  uname text;
begin
  -- Use username from metadata, fall back to email prefix
  uname := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1)
  );
  -- Ensure unique username by appending random suffix if needed
  if exists (select 1 from public.profiles where username = uname) then
    uname := uname || '_' || substr(md5(random()::text), 1, 4);
  end if;
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    uname,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Step 6: Verify everything was created
select 
  table_name,
  (select count(*) from pg_policies where tablename = t.table_name) as policy_count
from information_schema.tables t
where table_schema = 'public'
  and table_name in ('profiles','stories','story_likes','access_requests','approved_access','comments','notifications')
order by table_name;


-- ============================================================
-- CRONIQ — Full Schema + RLS (no recursion) 2
-- Paste entire file into Supabase SQL Editor and Run All
-- ============================================================

-- ── DROP everything first (safe re-run) ──────────────────
drop trigger  if exists on_auth_user_created       on auth.users;
drop trigger  if exists on_access_request_created  on access_requests;
drop trigger  if exists on_request_status_changed  on access_requests;
drop function if exists public.handle_new_user();
drop function if exists public.handle_access_request();
drop function if exists public.handle_request_status_change();
drop function if exists get_like_count(uuid);
drop table    if exists story_views      cascade;
drop table    if exists comments         cascade;
drop table    if exists notifications    cascade;
drop table    if exists approved_access  cascade;
drop table    if exists access_requests  cascade;
drop table    if exists story_likes      cascade;
drop table    if exists stories          cascade;
drop table    if exists profiles         cascade;


-- ── PHASE 1: Tables ──────────────────────────────────────

create table profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  username    text unique not null,
  full_name   text,
  bio         text,
  avatar_url  text,
  created_at  timestamptz default now()
);

create table stories (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  title       text not null,
  content     text not null,
  excerpt     text,
  category    text not null check (category in ('Experience','Education','Reflection','Secret','Milestone','Lesson')),
  visibility  text not null default 'public' check (visibility in ('public','private','request')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table story_likes (
  id          uuid default gen_random_uuid() primary key,
  story_id    uuid references stories(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  created_at  timestamptz default now(),
  unique(story_id, user_id)
);

create table access_requests (
  id            uuid default gen_random_uuid() primary key,
  story_id      uuid references stories(id) on delete cascade not null,
  requester_id  uuid references profiles(id) on delete cascade not null,
  owner_id      uuid references profiles(id) on delete cascade not null,
  reason        text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(story_id, requester_id)
);

create table approved_access (
  id          uuid default gen_random_uuid() primary key,
  story_id    uuid references stories(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  granted_at  timestamptz default now(),
  unique(story_id, user_id)
);

create table notifications (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid references profiles(id) on delete cascade not null,
  type              text not null check (type in ('access_request','request_approved','request_rejected','new_like')),
  message           text not null,
  related_story_id  uuid references stories(id) on delete cascade,
  related_user_id   uuid references profiles(id) on delete cascade,
  is_read           boolean default false,
  created_at        timestamptz default now()
);


-- ── RLS: Enable ──────────────────────────────────────────

alter table profiles        enable row level security;
alter table stories         enable row level security;
alter table story_likes     enable row level security;
alter table access_requests enable row level security;
alter table approved_access enable row level security;
alter table notifications   enable row level security;


-- ── RLS: Profiles ────────────────────────────────────────
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);


-- ── RLS: Stories (NO recursion) ──────────────────────────
-- IMPORTANT: We do NOT reference stories inside a stories policy.
-- Gated access is checked via the approved_access table only.
create policy "stories_select" on stories for select using (
  auth.uid() = user_id
  or visibility = 'public'
  or (
    visibility = 'request'
    and exists (
      select 1 from approved_access aa
      where aa.story_id = stories.id
        and aa.user_id  = auth.uid()
    )
  )
);
create policy "stories_insert" on stories for insert with check (auth.uid() = user_id);
create policy "stories_update" on stories for update using (auth.uid() = user_id);
create policy "stories_delete" on stories for delete using (auth.uid() = user_id);


-- ── RLS: Story Likes ─────────────────────────────────────
create policy "likes_select" on story_likes for select using (true);
create policy "likes_insert" on story_likes for insert with check (auth.uid() = user_id);
create policy "likes_delete" on story_likes for delete using (auth.uid() = user_id);


-- ── RLS: Access Requests ─────────────────────────────────
create policy "requests_select" on access_requests for select
  using (auth.uid() = requester_id or auth.uid() = owner_id);
create policy "requests_insert" on access_requests for insert
  with check (auth.uid() = requester_id);
create policy "requests_update" on access_requests for update
  using (auth.uid() = owner_id);


-- ── RLS: Approved Access ─────────────────────────────────
create policy "approved_select" on approved_access for select
  using (auth.uid() = user_id);
create policy "approved_insert" on approved_access for insert
  with check (
    exists (select 1 from stories s where s.id = story_id and s.user_id = auth.uid())
  );


-- ── RLS: Notifications ───────────────────────────────────
create policy "notif_select" on notifications for select using (auth.uid() = user_id);
create policy "notif_insert" on notifications for insert with check (true);
create policy "notif_update" on notifications for update using (auth.uid() = user_id);


-- ── PHASE 2: Auto-create profile on signup ───────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── PHASE 5: Notify owner on new access request ──────────
create or replace function public.handle_access_request()
returns trigger as $$
begin
  insert into public.notifications (user_id, type, message, related_story_id, related_user_id)
  values (
    new.owner_id, 'access_request',
    'Someone requested access to your story.',
    new.story_id, new.requester_id
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_access_request_created
  after insert on access_requests
  for each row execute procedure public.handle_access_request();


-- ── PHASE 5: Notify requester on approve/reject ──────────
create or replace function public.handle_request_status_change()
returns trigger as $$
begin
  if new.status = 'approved' then
    insert into public.notifications (user_id, type, message, related_story_id, related_user_id)
    values (new.requester_id, 'request_approved', 'Your access request was approved.', new.story_id, new.owner_id);
  elsif new.status = 'rejected' then
    insert into public.notifications (user_id, type, message, related_story_id, related_user_id)
    values (new.requester_id, 'request_rejected', 'Your access request was declined.', new.story_id, new.owner_id);
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_request_status_changed
  after update on access_requests
  for each row
  when (old.status = 'pending' and new.status <> 'pending')
  execute procedure public.handle_request_status_change();



-- 7. COMMENTS
create table comments (
  id          uuid default gen_random_uuid() primary key,
  story_id    uuid references stories(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  parent_id   uuid references comments(id) on delete cascade,
  content     text not null check (char_length(content) <= 500),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table comments enable row level security;

-- Comments: anyone can read comments on stories they can see
create policy "comments_select" on comments for select using (true);
create policy "comments_insert" on comments for insert with check (auth.uid() = user_id);
create policy "comments_update" on comments for update using (auth.uid() = user_id);
create policy "comments_delete" on comments for delete using (auth.uid() = user_id);

-- ── Verify ───────────────────────────────────────────────
select tablename, policyname, cmd
from pg_policies
where tablename in ('stories','profiles','story_likes','access_requests','approved_access','notifications')
order by tablename, cmd;




-- ============================================================
-- CRONIQ — Full Schema + RLS (no recursion)
-- Paste entire file into Supabase SQL Editor and Run All
-- ============================================================

-- ── DROP everything first (safe re-run) ──────────────────
drop trigger  if exists on_auth_user_created       on auth.users;
drop trigger  if exists on_access_request_created  on access_requests;
drop trigger  if exists on_request_status_changed  on access_requests;
drop function if exists public.handle_new_user();
drop function if exists public.handle_access_request();
drop function if exists public.handle_request_status_change();
drop function if exists get_like_count(uuid);
drop table    if exists story_views      cascade;
drop table    if exists notifications    cascade;
drop table    if exists approved_access  cascade;
drop table    if exists access_requests  cascade;
drop table    if exists story_likes      cascade;
drop table    if exists stories          cascade;
drop table    if exists profiles         cascade;


-- ── PHASE 1: Tables ──────────────────────────────────────

create table profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  username    text unique not null,
  full_name   text,
  bio         text,
  avatar_url  text,
  created_at  timestamptz default now()
);

create table stories (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  title       text not null,
  content     text not null,
  excerpt     text,
  category    text not null check (category in ('Experience','Education','Reflection','Secret','Milestone','Lesson')),
  visibility  text not null default 'public' check (visibility in ('public','private','request')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table story_likes (
  id          uuid default gen_random_uuid() primary key,
  story_id    uuid references stories(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  created_at  timestamptz default now(),
  unique(story_id, user_id)
);

create table access_requests (
  id            uuid default gen_random_uuid() primary key,
  story_id      uuid references stories(id) on delete cascade not null,
  requester_id  uuid references profiles(id) on delete cascade not null,
  owner_id      uuid references profiles(id) on delete cascade not null,
  reason        text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(story_id, requester_id)
);

create table approved_access (
  id          uuid default gen_random_uuid() primary key,
  story_id    uuid references stories(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  granted_at  timestamptz default now(),
  unique(story_id, user_id)
);

create table notifications (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid references profiles(id) on delete cascade not null,
  type              text not null check (type in ('access_request','request_approved','request_rejected','new_like')),
  message           text not null,
  related_story_id  uuid references stories(id) on delete cascade,
  related_user_id   uuid references profiles(id) on delete cascade,
  is_read           boolean default false,
  created_at        timestamptz default now()
);


-- ── RLS: Enable ──────────────────────────────────────────

alter table profiles        enable row level security;
alter table stories         enable row level security;
alter table story_likes     enable row level security;
alter table access_requests enable row level security;
alter table approved_access enable row level security;
alter table notifications   enable row level security;


-- ── RLS: Profiles ────────────────────────────────────────
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);


-- ── RLS: Stories (NO recursion) ──────────────────────────
-- IMPORTANT: We do NOT reference stories inside a stories policy.
-- Gated access is checked via the approved_access table only.
create policy "stories_select" on stories for select using (
  auth.uid() = user_id
  or visibility = 'public'
  or (
    visibility = 'request'
    and exists (
      select 1 from approved_access aa
      where aa.story_id = stories.id
        and aa.user_id  = auth.uid()
    )
  )
);
create policy "stories_insert" on stories for insert with check (auth.uid() = user_id);
create policy "stories_update" on stories for update using (auth.uid() = user_id);
create policy "stories_delete" on stories for delete using (auth.uid() = user_id);


-- ── RLS: Story Likes ─────────────────────────────────────
create policy "likes_select" on story_likes for select using (true);
create policy "likes_insert" on story_likes for insert with check (auth.uid() = user_id);
create policy "likes_delete" on story_likes for delete using (auth.uid() = user_id);


-- ── RLS: Access Requests ─────────────────────────────────
create policy "requests_select" on access_requests for select
  using (auth.uid() = requester_id or auth.uid() = owner_id);
create policy "requests_insert" on access_requests for insert
  with check (auth.uid() = requester_id);
create policy "requests_update" on access_requests for update
  using (auth.uid() = owner_id);


-- ── RLS: Approved Access ─────────────────────────────────
create policy "approved_select" on approved_access for select
  using (auth.uid() = user_id);
create policy "approved_insert" on approved_access for insert
  with check (
    exists (select 1 from stories s where s.id = story_id and s.user_id = auth.uid())
  );


-- ── RLS: Notifications ───────────────────────────────────
create policy "notif_select" on notifications for select using (auth.uid() = user_id);
create policy "notif_insert" on notifications for insert with check (true);
create policy "notif_update" on notifications for update using (auth.uid() = user_id);


-- ── PHASE 2: Auto-create profile on signup ───────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── PHASE 5: Notify owner on new access request ──────────
create or replace function public.handle_access_request()
returns trigger as $$
begin
  insert into public.notifications (user_id, type, message, related_story_id, related_user_id)
  values (
    new.owner_id, 'access_request',
    'Someone requested access to your story.',
    new.story_id, new.requester_id
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_access_request_created
  after insert on access_requests
  for each row execute procedure public.handle_access_request();


-- ── PHASE 5: Notify requester on approve/reject ──────────
create or replace function public.handle_request_status_change()
returns trigger as $$
begin
  if new.status = 'approved' then
    insert into public.notifications (user_id, type, message, related_story_id, related_user_id)
    values (new.requester_id, 'request_approved', 'Your access request was approved.', new.story_id, new.owner_id);
  elsif new.status = 'rejected' then
    insert into public.notifications (user_id, type, message, related_story_id, related_user_id)
    values (new.requester_id, 'request_rejected', 'Your access request was declined.', new.story_id, new.owner_id);
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_request_status_changed
  after update on access_requests
  for each row
  when (old.status = 'pending' and new.status <> 'pending')
  execute procedure public.handle_request_status_change();


-- ── Verify ───────────────────────────────────────────────
select tablename, policyname, cmd
from pg_policies
where tablename in ('stories','profiles','story_likes','access_requests','approved_access','notifications')
order by tablename, cmd;





-- ══════════════════════════════════════════════════════
-- CRONIQ — Fix infinite recursion in RLS policies
-- Run this entire file in Supabase SQL Editor
-- ══════════════════════════════════════════════════════

-- ── 1. DROP ALL EXISTING POLICIES on stories ──────────
DROP POLICY IF EXISTS "Users can view own stories"        ON stories;
DROP POLICY IF EXISTS "Users can insert own stories"      ON stories;
DROP POLICY IF EXISTS "Users can update own stories"      ON stories;
DROP POLICY IF EXISTS "Users can delete own stories"      ON stories;
DROP POLICY IF EXISTS "Public stories are viewable"       ON stories;
DROP POLICY IF EXISTS "Approved users can view stories"   ON stories;
DROP POLICY IF EXISTS "Allow read access"                 ON stories;
DROP POLICY IF EXISTS "Allow insert"                      ON stories;
DROP POLICY IF EXISTS "Allow update"                      ON stories;
DROP POLICY IF EXISTS "Allow delete"                      ON stories;
DROP POLICY IF EXISTS "stories_select_policy"             ON stories;
DROP POLICY IF EXISTS "stories_insert_policy"             ON stories;
DROP POLICY IF EXISTS "stories_update_policy"             ON stories;
DROP POLICY IF EXISTS "stories_delete_policy"             ON stories;

-- Drop any remaining policies on stories (catch-all)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'stories'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON stories', pol.policyname);
  END LOOP;
END $$;


-- ── 2. MAKE SURE RLS IS ENABLED ───────────────────────
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;


-- ── 3. CLEAN SIMPLE POLICIES — no recursion ───────────

-- SELECT: owner sees all their stories
--         everyone sees public stories
--         approved users see request-gated stories
CREATE POLICY "stories_select"
  ON stories FOR SELECT
  USING (
    -- Always let the owner see their own stories
    auth.uid() = user_id
    OR
    -- Public stories visible to everyone
    visibility = 'public'
    OR
    -- Gated stories visible if there's an approved access_request
    (
      visibility = 'request'
      AND EXISTS (
        SELECT 1 FROM access_requests
        WHERE access_requests.story_id = stories.id
          AND access_requests.requester_id = auth.uid()
          AND access_requests.status = 'approved'
      )
    )
  );

-- INSERT: only authenticated users, only for themselves
CREATE POLICY "stories_insert"
  ON stories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: only the owner
CREATE POLICY "stories_update"
  ON stories FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: only the owner
CREATE POLICY "stories_delete"
  ON stories FOR DELETE
  USING (auth.uid() = user_id);


-- ── 4. FIX access_requests TABLE ──────────────────────
DROP POLICY IF EXISTS "Users can view own requests"     ON access_requests;
DROP POLICY IF EXISTS "Users can insert requests"       ON access_requests;
DROP POLICY IF EXISTS "Users can update requests"       ON access_requests;
DROP POLICY IF EXISTS "access_requests_select_policy"   ON access_requests;
DROP POLICY IF EXISTS "access_requests_insert_policy"   ON access_requests;
DROP POLICY IF EXISTS "access_requests_update_policy"   ON access_requests;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'access_requests'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON access_requests', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- Requester can see their own requests
-- Story owner can see requests for their stories
CREATE POLICY "access_requests_select"
  ON access_requests FOR SELECT
  USING (
    auth.uid() = requester_id
    OR
    auth.uid() = (SELECT user_id FROM stories WHERE id = access_requests.story_id LIMIT 1)
  );

-- Anyone authenticated can submit a request
CREATE POLICY "access_requests_insert"
  ON access_requests FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Only the story owner can approve/reject
CREATE POLICY "access_requests_update"
  ON access_requests FOR UPDATE
  USING (
    auth.uid() = (SELECT user_id FROM stories WHERE id = access_requests.story_id LIMIT 1)
  );


-- ── 5. FIX story_likes TABLE ──────────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'story_likes'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON story_likes', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE story_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_likes_select"
  ON story_likes FOR SELECT
  USING (true);  -- anyone can read like counts

CREATE POLICY "story_likes_insert"
  ON story_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "story_likes_delete"
  ON story_likes FOR DELETE
  USING (auth.uid() = user_id);


-- ── 6. FIX profiles TABLE ─────────────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  USING (true);  -- profiles are public

CREATE POLICY "profiles_insert"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ── 7. VERIFY — should show clean policies ────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('stories', 'access_requests', 'story_likes', 'profiles')
ORDER BY tablename, cmd;




-- ============================================
-- CRONIQ DATABASE SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- 1. PROFILES (auto-created when user signs up)
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  full_name text,
  bio text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc', now())
);

-- 2. STORIES
create table stories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  content text not null,
  excerpt text,
  category text not null check (category in ('Experience','Education','Reflection','Secret','Milestone','Lesson')),
  visibility text not null default 'public' check (visibility in ('public','private','request')),
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

-- 3. STORY LIKES
create table story_likes (
  id uuid default gen_random_uuid() primary key,
  story_id uuid references stories(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc', now()),
  unique(story_id, user_id)
);

-- 4. ACCESS REQUESTS
create table access_requests (
  id uuid default gen_random_uuid() primary key,
  story_id uuid references stories(id) on delete cascade not null,
  requester_id uuid references profiles(id) on delete cascade not null,
  owner_id uuid references profiles(id) on delete cascade not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now()),
  unique(story_id, requester_id)
);

-- 5. APPROVED ACCESS (who can read gated stories)
create table approved_access (
  id uuid default gen_random_uuid() primary key,
  story_id uuid references stories(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  granted_at timestamp with time zone default timezone('utc', now()),
  unique(story_id, user_id)
);

-- 6. NOTIFICATIONS
create table notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null check (type in ('access_request','request_approved','request_rejected','new_like')),
  message text not null,
  related_story_id uuid references stories(id) on delete cascade,
  related_user_id uuid references profiles(id) on delete cascade,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc', now())
);

-- 7. STORY VIEWS (optional tracking)
create table story_views (
  id uuid default gen_random_uuid() primary key,
  story_id uuid references stories(id) on delete cascade not null,
  viewer_id uuid references profiles(id) on delete cascade,
  viewed_at timestamp with time zone default timezone('utc', now())
);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
alter table profiles enable row level security;
alter table stories enable row level security;
alter table story_likes enable row level security;
alter table access_requests enable row level security;
alter table approved_access enable row level security;
alter table notifications enable row level security;
alter table story_views enable row level security;

-- PROFILES policies
create policy "Public profiles are viewable by everyone"
  on profiles for select using (true);

create policy "Users can insert their own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);

-- STORIES policies
create policy "Public stories viewable by all"
  on stories for select
  using (
    visibility = 'public'
    or user_id = auth.uid()
    or (
      visibility = 'request'
      and exists (
        select 1 from approved_access
        where story_id = stories.id and user_id = auth.uid()
      )
    )
  );

create policy "Users can insert their own stories"
  on stories for insert with check (auth.uid() = user_id);

create policy "Users can update their own stories"
  on stories for update using (auth.uid() = user_id);

create policy "Users can delete their own stories"
  on stories for delete using (auth.uid() = user_id);

-- STORY LIKES policies
create policy "Likes viewable by all"
  on story_likes for select using (true);

create policy "Authenticated users can like"
  on story_likes for insert with check (auth.uid() = user_id);

create policy "Users can unlike"
  on story_likes for delete using (auth.uid() = user_id);

-- ACCESS REQUESTS policies
create policy "Owners and requesters can see requests"
  on access_requests for select
  using (auth.uid() = owner_id or auth.uid() = requester_id);

create policy "Authenticated users can send requests"
  on access_requests for insert with check (auth.uid() = requester_id);

create policy "Owners can update request status"
  on access_requests for update using (auth.uid() = owner_id);

-- APPROVED ACCESS policies
create policy "Owner and approved user can see approval"
  on approved_access for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from stories where id = story_id and user_id = auth.uid()
    )
  );

create policy "System can insert approvals"
  on approved_access for insert with check (
    exists (
      select 1 from stories where id = story_id and user_id = auth.uid()
    )
  );

-- NOTIFICATIONS policies
create policy "Users see their own notifications"
  on notifications for select using (auth.uid() = user_id);

create policy "System can insert notifications"
  on notifications for insert with check (true);

create policy "Users can mark notifications read"
  on notifications for update using (auth.uid() = user_id);

-- ============================================
-- FUNCTION: auto-create profile on signup
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: fires after every new user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- FUNCTION: get story like count
-- ============================================
create or replace function get_like_count(story_uuid uuid)
returns bigint as $$
  select count(*) from story_likes where story_id = story_uuid;
$$ language sql stable;