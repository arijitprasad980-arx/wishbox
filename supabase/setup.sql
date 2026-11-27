create extension if not exists pgcrypto with schema extensions;

create table if not exists public.wish_secret_boxes (
  id uuid primary key,
  owner_token_hash text not null,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.wish_secret_messages (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.wish_secret_boxes(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint wish_secret_messages_length check (pg_catalog.length(message) between 1 and 8192)
);

create index if not exists wish_secret_messages_box_created_idx
  on public.wish_secret_messages (box_id, created_at desc);

alter table public.wish_secret_boxes enable row level security;
alter table public.wish_secret_messages enable row level security;

revoke all on public.wish_secret_boxes from public, anon, authenticated;
revoke all on public.wish_secret_messages from public, anon, authenticated;

create or replace function public.create_wish_secret_box(p_box_id uuid, p_owner_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner_token is null or pg_catalog.length(p_owner_token) < 40 then
    raise exception using errcode = '22023', message = 'Invalid private inbox key.';
  end if;

  insert into public.wish_secret_boxes (id, owner_token_hash)
  values (
    p_box_id,
    pg_catalog.encode(extensions.digest(p_owner_token, 'sha256'), 'hex')
  );
end;
$$;

create or replace function public.submit_wish_secret_message(p_box_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_count integer;
begin
  if p_message is null or pg_catalog.length(pg_catalog.btrim(p_message)) not between 1 and 8192 then
    raise exception using errcode = '22023', message = 'The encrypted message is invalid or too long.';
  end if;

  perform 1
  from public.wish_secret_boxes
  where id = p_box_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'This secret message box is unavailable.';
  end if;

  select pg_catalog.count(*)::integer
  into message_count
  from public.wish_secret_messages
  where box_id = p_box_id;

  if message_count >= 50 then
    raise exception using errcode = '54000', message = 'This secret message box is full.';
  end if;

  insert into public.wish_secret_messages (box_id, message)
  values (p_box_id, pg_catalog.btrim(p_message));
end;
$$;

create or replace function public.read_wish_secret_messages(p_box_id uuid, p_owner_token text)
returns table (id uuid, message text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_token_hash text;
begin
  select owner_token_hash
  into saved_token_hash
  from public.wish_secret_boxes
  where wish_secret_boxes.id = p_box_id;

  if saved_token_hash is null
    or p_owner_token is null
    or saved_token_hash <> pg_catalog.encode(extensions.digest(p_owner_token, 'sha256'), 'hex')
  then
    raise exception using errcode = '42501', message = 'The private inbox key is invalid.';
  end if;

  return query
  select wish_secret_messages.id, wish_secret_messages.message, wish_secret_messages.created_at
  from public.wish_secret_messages
  where wish_secret_messages.box_id = p_box_id
  order by wish_secret_messages.created_at desc;
end;
$$;

revoke all on function public.create_wish_secret_box(uuid, text) from public;
revoke all on function public.submit_wish_secret_message(uuid, text) from public;
revoke all on function public.read_wish_secret_messages(uuid, text) from public;

grant execute on function public.create_wish_secret_box(uuid, text) to anon;
grant execute on function public.submit_wish_secret_message(uuid, text) to anon;
grant execute on function public.read_wish_secret_messages(uuid, text) to anon;
