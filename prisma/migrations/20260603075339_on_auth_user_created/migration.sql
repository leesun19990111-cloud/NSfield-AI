-- 4자리 영숫자 식별코드 생성 (혼동 문자 제외)
create or replace function gen_topup_code() returns text
language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  loop
    result := '';
    for i in 1..4 loop
      result := result || substr(chars, 1 + floor(random()*length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from users where topup_code = result);
  end loop;
  return result;
end$$;

-- auth.users insert 시 public.users + wallets 생성
create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into users(id, email, display_name, topup_code)
  values (
    new.id::text,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    gen_topup_code()
  );
  insert into wallets(id, user_id, balance_krw, updated_at)
  values (gen_random_uuid()::text, new.id::text, 0, now());
  return new;
end$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();
