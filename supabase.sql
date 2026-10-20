-- Run this script in Supabase Dashboard > SQL Editor.
-- Private profile details stay in profiles. The public table contains only names and gift ideas.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  age smallint not null check (age between 1 and 120),
  products jsonb not null default '[]'::jsonb,
  constraint profiles_products_count check (
    jsonb_typeof(products) = 'array'
    and (jsonb_array_length(products) = 0 or jsonb_array_length(products) between 2 and 3)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.public_wishlists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  products jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.public_wishlists enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "Anyone can read published wishlists" on public.public_wishlists;
create policy "Anyone can read published wishlists" on public.public_wishlists for select to anon, authenticated using (true);

grant select on public.profiles to authenticated;
grant update (products) on public.profiles to authenticated;
grant select on public.public_wishlists to anon, authenticated;

create or replace function public.create_profile_for_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_name text;
  new_age integer;
begin
  new_name := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  new_age := (new.raw_user_meta_data ->> 'age')::integer;
  if new_name = '' or new_age is null or new_age < 1 or new_age > 120 then
    raise exception 'Valid full name and age are required';
  end if;
  insert into public.profiles (id, full_name, age) values (new.id, new_name, new_age);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.create_profile_for_new_auth_user();

create or replace function public.publish_profile_wishlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_count integer;
begin
  new.updated_at := now();
  product_count := jsonb_array_length(new.products);
  if product_count between 2 and 3 then
    insert into public.public_wishlists (user_id, full_name, products, updated_at)
    values (new.id, new.full_name, new.products, now())
    on conflict (user_id) do update
      set full_name = excluded.full_name,
          products = excluded.products,
          updated_at = now();
  else
    delete from public.public_wishlists where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_wishlist_changed on public.profiles;
create trigger on_profile_wishlist_changed
after update of products, full_name on public.profiles
for each row execute procedure public.publish_profile_wishlist();

-- Existing profiles can be republished if this script is run again.
insert into public.public_wishlists (user_id, full_name, products, updated_at)
select id, full_name, products, now()
from public.profiles
where jsonb_array_length(products) between 2 and 3
on conflict (user_id) do update
set full_name = excluded.full_name, products = excluded.products, updated_at = now();
