-- 헬퍼: 현재 사용자가 admin인지
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from users where id = auth.uid()::text and role = 'ADMIN');
$$;

-- users
alter table users enable row level security;
drop policy if exists users_self_select on users;
create policy users_self_select on users for select
  using (id = auth.uid()::text or is_admin());
drop policy if exists users_self_update on users;
create policy users_self_update on users for update
  using (id = auth.uid()::text);

-- wallets
alter table wallets enable row level security;
drop policy if exists wallets_self_select on wallets;
create policy wallets_self_select on wallets for select
  using (user_id = auth.uid()::text or is_admin());

-- wallet_transactions
alter table wallet_transactions enable row level security;
drop policy if exists wtx_self_select on wallet_transactions;
create policy wtx_self_select on wallet_transactions for select
  using (
    exists(select 1 from wallets w where w.id = wallet_id
           and (w.user_id = auth.uid()::text or is_admin()))
  );

-- topup_requests
alter table topup_requests enable row level security;
drop policy if exists topup_self_select on topup_requests;
create policy topup_self_select on topup_requests for select
  using (user_id = auth.uid()::text or is_admin());
drop policy if exists topup_self_insert on topup_requests;
create policy topup_self_insert on topup_requests for insert
  with check (user_id = auth.uid()::text);

-- generations
alter table generations enable row level security;
drop policy if exists gen_self_select on generations;
create policy gen_self_select on generations for select
  using (user_id = auth.uid()::text or is_admin());
drop policy if exists gen_self_insert on generations;
create policy gen_self_insert on generations for insert
  with check (user_id = auth.uid()::text);

-- models: 모두 읽기, 쓰기 admin
alter table models enable row level security;
drop policy if exists models_read on models;
create policy models_read on models for select using (true);
drop policy if exists models_admin_write on models;
create policy models_admin_write on models for all
  using (is_admin()) with check (is_admin());

-- fx_rates: 모두 읽기, 쓰기 admin
alter table fx_rates enable row level security;
drop policy if exists fx_read on fx_rates;
create policy fx_read on fx_rates for select using (true);
drop policy if exists fx_admin_write on fx_rates;
create policy fx_admin_write on fx_rates for all
  using (is_admin()) with check (is_admin());

-- admin_actions: admin만
alter table admin_actions enable row level security;
drop policy if exists admin_actions_admin on admin_actions;
create policy admin_actions_admin on admin_actions for all
  using (is_admin()) with check (is_admin());
