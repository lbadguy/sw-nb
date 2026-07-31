begin;

alter table public.posts enable row level security;
alter table public.posts add column if not exists created_at timestamptz not null default now();

revoke all on table public.posts from anon, authenticated;
grant select on table public.posts to anon, authenticated;

drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts for select to anon, authenticated using (true);

create table if not exists public.post_view_events (
  post_id bigint not null references public.posts(id) on delete cascade,
  visitor_key text not null check (char_length(visitor_key) between 32 and 200),
  window_start timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (post_id, visitor_key, window_start)
);

alter table public.post_view_events enable row level security;
revoke all on table public.post_view_events from public, anon, authenticated;

drop function if exists public.verify_admin_password_rpc(text);
drop function if exists public._is_admin_password_valid(text);
drop function if exists public.create_post_rpc(text, text, text, text, text, text, text);
drop function if exists public.update_post_rpc(text, bigint, text, text, text, text, text);
drop function if exists public.delete_post_rpc(text, bigint);

create or replace function public.create_post_rpc(
  title text,
  topic text,
  snippet text,
  content text,
  time_str text,
  images text
)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_row public.posts;
begin
  insert into public.posts (title, topic, snippet, content, time_str, likes, comments, collects, images, comments_json)
  values (
    coalesce(nullif(trim(title), ''), '无标题文章'),
    coalesce(nullif(trim(topic), ''), '#日常分享'),
    nullif(snippet, ''),
    coalesce(content, ''),
    coalesce(nullif(trim(time_str), ''), to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    1,
    0,
    0,
    nullif(images, ''),
    null
  )
  returning * into inserted_row;
  return inserted_row;
end;
$$;

create or replace function public.update_post_rpc(
  target_post_id bigint,
  next_title text,
  next_topic text,
  next_snippet text,
  next_content text,
  next_images text
)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.posts;
begin
  update public.posts
  set
    title = coalesce(nullif(trim(next_title), ''), title),
    topic = coalesce(nullif(trim(next_topic), ''), topic),
    snippet = coalesce(next_snippet, snippet),
    content = coalesce(next_content, content),
    images = coalesce(next_images, images)
  where id = target_post_id
  returning * into updated_row;
  if updated_row is null then raise exception 'post not found' using errcode = 'P0002'; end if;
  return updated_row;
end;
$$;

create or replace function public.delete_post_rpc(target_post_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.posts where id = target_post_id;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

create or replace function public.increment_post_views_rpc(target_post_id bigint, input_visitor_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_window timestamptz := date_trunc('hour', timezone('utc', now()));
  new_views integer;
begin
  insert into public.post_view_events (post_id, visitor_key, window_start)
  values (target_post_id, left(trim(input_visitor_key), 200), current_window)
  on conflict do nothing;

  if found then
    update public.posts set likes = coalesce(likes, 0) + 1 where id = target_post_id returning likes into new_views;
  else
    select coalesce(likes, 0) into new_views from public.posts where id = target_post_id;
  end if;

  if new_views is null then raise exception 'post not found' using errcode = 'P0002'; end if;
  return new_views;
end;
$$;

revoke execute on function public.create_post_rpc(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.update_post_rpc(bigint, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.delete_post_rpc(bigint) from public, anon, authenticated;
revoke execute on function public.increment_post_views_rpc(bigint, text) from public, anon, authenticated;

grant execute on function public.create_post_rpc(text, text, text, text, text, text) to service_role;
grant execute on function public.update_post_rpc(bigint, text, text, text, text, text) to service_role;
grant execute on function public.delete_post_rpc(bigint) to service_role;
grant execute on function public.increment_post_views_rpc(bigint, text) to service_role;

commit;
