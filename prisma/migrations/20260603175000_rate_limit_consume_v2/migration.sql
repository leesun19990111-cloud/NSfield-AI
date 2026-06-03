-- rate_limit_consume v2: 첫 요청 동시 경합 시 PK 위반 → ON CONFLICT DO NOTHING + 재평가.
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
    -- 동시 첫 요청 경합 안전: ON CONFLICT
    insert into rate_limits(user_id, action, window_start, count)
      values (p_user_id, p_action, v_now, 1)
      on conflict (user_id, action) do nothing;
    -- 다른 트랜잭션이 먼저 삽입했으면 잠금 후 재평가
    if not found then
      select * into v_row from rate_limits where user_id = p_user_id and action = p_action for update;
      if found then
        if v_now - v_row.window_start >= make_interval(secs => p_window_sec) then
          update rate_limits set window_start = v_now, count = 1 where user_id = p_user_id and action = p_action;
          return true;
        elsif v_row.count < p_limit then
          update rate_limits set count = count + 1 where user_id = p_user_id and action = p_action;
          return true;
        else
          return false;
        end if;
      end if;
    end if;
    return true;
  end if;
  if v_now - v_row.window_start >= make_interval(secs => p_window_sec) then
    update rate_limits set window_start = v_now, count = 1 where user_id = p_user_id and action = p_action;
    return true;
  end if;
  if v_row.count < p_limit then
    update rate_limits set count = count + 1 where user_id = p_user_id and action = p_action;
    return true;
  end if;
  return false;
end$$;
