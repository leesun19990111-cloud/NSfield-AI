-- 충전 요청 승인: 상태 변경 + 잔액 적용을 한 트랜잭션으로.
-- id 컬럼은 TEXT이므로 파라미터도 text.
create or replace function apply_topup(
  p_request_id text,
  p_admin_id   text
) returns void
language plpgsql as $$
declare
  v_req topup_requests;
  v_wallet_id text;
begin
  select * into v_req from topup_requests where id = p_request_id for update;
  if not found then raise exception 'TOPUP_NOT_FOUND'; end if;
  if v_req.status <> 'PENDING' then raise exception 'TOPUP_NOT_PENDING'; end if;

  select id into v_wallet_id from wallets where user_id = v_req.user_id;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  update topup_requests
    set status = 'APPROVED', reviewed_by = p_admin_id, reviewed_at = now()
    where id = p_request_id;

  perform wallet_apply_tx(
    v_wallet_id, 'TOPUP', v_req.amount_krw, 'topup_request', p_request_id, '계좌이체 충전'
  );
end$$;
