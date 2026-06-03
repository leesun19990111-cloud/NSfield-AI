-- 한 generation당 REFUND는 최대 1회 (이중 환불 차단). CHARGE/정산엔 영향 없음.
create unique index if not exists uniq_refund_per_generation
  on wallet_transactions (ref_id)
  where type = 'REFUND' and ref_type = 'generation';
