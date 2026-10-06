-- DrawUp V18.1: unlimited credit access for chosen accounts.
-- Adds arch_coach_credit_accounts.unlimited_access (default false). Accounts with it set
-- are never charged by Arch Coach, DrawUp Check or DrawUp Swap (all use this function).
-- Members cannot change it: the table only has a read-own policy; only HQ, the service
-- role or the SQL editor can set it. Additive and safe to re-run.

alter table public.arch_coach_credit_accounts add column if not exists unlimited_access boolean not null default false;

create or replace function public.reserve_arch_coach_v11_access(
  p_user_id uuid,
  p_is_anonymous boolean,
  p_cost integer default 3,
  p_action text default 'basic_question',
  p_thread_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_account public.arch_coach_credit_accounts%rowtype;
  v_usage public.arch_coach_usage%rowtype;
  v_needed integer := greatest(p_cost,0);
  v_monthly integer := 0;
  v_purchased integer := 0;
begin
  if p_user_id is null then return jsonb_build_object('ok',false,'code','NO_USER'); end if;

  -- Unsigned/anonymous visitors: exactly 10 guest questions, no credit wallet.
  if coalesce(p_is_anonymous,false) then
    insert into public.arch_coach_usage(user_id) values(p_user_id) on conflict(user_id) do nothing;
    select * into v_usage from public.arch_coach_usage where user_id=p_user_id for update;
    if v_usage.free_questions_used >= 10 then
      return jsonb_build_object('ok',false,'code','GUEST_LIMIT_REACHED','free_questions_remaining',0);
    end if;
    update public.arch_coach_usage set free_questions_used=free_questions_used+1,updated_at=now() where user_id=p_user_id;
    return jsonb_build_object('ok',true,'access_type','free_question','free_questions_remaining',9-v_usage.free_questions_used,'credits_charged',0);
  end if;

  insert into public.arch_coach_credit_accounts(user_id,monthly_credit_allowance,monthly_credits_remaining)
  values(p_user_id,50,50) on conflict(user_id) do nothing;
  select * into v_account from public.arch_coach_credit_accounts where user_id=p_user_id for update;

  -- Unlimited access (set only by DrawUp HQ / SQL editor): never charged.
  if coalesce(v_account.unlimited_access,false) then
    return jsonb_build_object('ok',true,'access_type','unlimited','unlimited',true,'credits_charged',0,'credits_remaining',v_account.monthly_credits_remaining+v_account.purchased_credits_remaining,'monthly_used',0,'purchased_used',0,'plan_code',v_account.plan_code);
  end if;

  if (v_account.monthly_credits_remaining+v_account.purchased_credits_remaining) < v_needed then
    return jsonb_build_object('ok',false,'code','INSUFFICIENT_CREDITS','credits_remaining',v_account.monthly_credits_remaining+v_account.purchased_credits_remaining,'credits_required',v_needed,'plan_code',v_account.plan_code);
  end if;

  v_monthly := least(v_account.monthly_credits_remaining,v_needed);
  v_purchased := v_needed-v_monthly;
  update public.arch_coach_credit_accounts set monthly_credits_remaining=monthly_credits_remaining-v_monthly,purchased_credits_remaining=purchased_credits_remaining-v_purchased,updated_at=now() where user_id=p_user_id;
  insert into public.arch_coach_credit_ledger(user_id,delta,reason,metadata,thread_id)
  values(p_user_id,-v_needed,'arch_coach_v11',jsonb_build_object('action',p_action,'monthly_used',v_monthly,'purchased_used',v_purchased),p_thread_id);
  return jsonb_build_object('ok',true,'access_type','credits','credits_charged',v_needed,'credits_remaining',(v_account.monthly_credits_remaining+v_account.purchased_credits_remaining)-v_needed,'monthly_used',v_monthly,'purchased_used',v_purchased,'plan_code',v_account.plan_code);
end; $$;

revoke all on function public.reserve_arch_coach_v11_access(uuid,boolean,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_arch_coach_v11_access(uuid,boolean,integer,text,uuid) to service_role;
