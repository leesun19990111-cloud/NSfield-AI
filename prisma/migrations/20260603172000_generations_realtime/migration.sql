-- generations 테이블을 Realtime publication에 추가 (이미 있으면 무시)
do $$
begin
  alter publication supabase_realtime add table generations;
exception
  when duplicate_object then null;
  when undefined_object then
    -- publication이 없으면 생성 후 추가
    execute 'create publication supabase_realtime for table generations';
end $$;
