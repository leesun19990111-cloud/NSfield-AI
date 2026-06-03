-- 토큰 버킷(고정 윈도우). (user_id, action) 키로 윈도우 내 count 추적.
create table if not exists rate_limits (
  user_id      text not null,
  action       text not null,
  window_start timestamptz not null default now(),
  count        int not null default 0,
  primary key (user_id, action)
);

-- p_limit 회 / p_window_sec 초. 허용 시 true(+1), 초과 시 false.
create or replace function rate_limit_consume(
  p_user_id    text,
  p_action     text,
  p_limit      int,
  p_window_sec int
) returns boolean
language plpgsql as $$
declare
  v_now timestamptz := now();
  v_row rate_limits;
begin
  select * into v_row from rate_limits where user_id = p_user_id and action = p_action for update;
  if not found then
    insert into rate_limits(user_id, action, window_start, count) values (p_user_id, p_action, v_now, 1);
    return true;
  end if;
  -- 윈도우 만료 → 리셋
  if v_now - v_row.window_start >= make_interval(secs => p_window_sec) then
    update rate_limits set window_start = v_now, count = 1 where user_id = p_user_id and action = p_action;
    return true;
  end if;
  -- 윈도우 내
  if v_row.count < p_limit then
    update rate_limits set count = count + 1 where user_id = p_user_id and action = p_action;
    return true;
  end if;
  return false;
end$$;
