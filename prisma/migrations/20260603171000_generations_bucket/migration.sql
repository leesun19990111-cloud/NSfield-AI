-- private 버킷 'generations'
insert into storage.buckets (id, name, public)
values ('generations', 'generations', false)
on conflict (id) do nothing;

-- 객체 경로 규약: {user_id}/{generation_id}/output_{i}.png
-- 사용자 본인 폴더만 접근(anon/authenticated 키). 서버(service_role)는 RLS 우회.
drop policy if exists gen_objects_self_select on storage.objects;
create policy gen_objects_self_select on storage.objects for select
  using (bucket_id = 'generations' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists gen_objects_self_insert on storage.objects;
create policy gen_objects_self_insert on storage.objects for insert
  with check (bucket_id = 'generations' and (storage.foldername(name))[1] = auth.uid()::text);
