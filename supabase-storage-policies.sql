-- Run this in Supabase SQL Editor for project wjzutgwmdrtlhmgebmua.
-- This makes the browser-based upload/download/delete flow work for bucket user-files.
-- Note: this is permissive because this static site uses Firebase Auth, not Supabase Auth.

insert into storage.buckets (id, name, public)
values ('user-files', 'user-files', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read user-files" on storage.objects;
create policy "Public read user-files"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'user-files');

drop policy if exists "Public upload user-files" on storage.objects;
create policy "Public upload user-files"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'user-files');

drop policy if exists "Public delete user-files" on storage.objects;
create policy "Public delete user-files"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'user-files');
