-- 잔액 변동의 단일 진입점. 잔액 = Σ(거래) 불변식과 음수 차단을 강제한다.
-- id/wallet_id/ref_id 컬럼은 TEXT(Prisma String @default(uuid()))이므로 파라미터도 text.
drop function if exists wallet_apply_tx(uuid, text, int, text, uuid, text);

create or replace function wallet_apply_tx(
  p_wallet_id  text,
  p_type       text,
  p_amount_krw int,
  p_ref_type   text default null,
  p_ref_id     text default null,
  p_memo       text default null
) returns wallet_transactions
language plpgsql
as $$
declare
  v_new_balance int;
  v_row wallet_transactions;
begin
  perform 1 from wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  select balance_krw + p_amount_krw into v_new_balance
    from wallets where id = p_wallet_id;

  if v_new_balance < 0 and p_type <> 'ADJUSTMENT' then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into wallet_transactions(
    id, wallet_id, type, amount_krw, balance_after, ref_type, ref_id, memo, created_at
  ) values (
    gen_random_uuid()::text, p_wallet_id, p_type::"TxType", p_amount_krw, v_new_balance,
    p_ref_type, p_ref_id, p_memo, now()
  ) returning * into v_row;

  update wallets set balance_krw = v_new_balance, updated_at = now()
    where id = p_wallet_id;

  return v_row;
end$$;
