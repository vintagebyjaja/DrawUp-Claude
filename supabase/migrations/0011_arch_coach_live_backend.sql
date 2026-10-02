-- DrawUp Arch Coach — Phase 1 live backend
-- Run this ONCE in the SAME DrawUp Supabase project.
-- Safe to run after V9 migrations 0009 and 0010.

-- Add a few fields that help the live AI backend.
alter table public.arch_coach_credit_ledger
  add column if not exists thread_id uuid;

-- Reserve access BEFORE calling the AI.
-- Explore users receive 10 free standard questions. Paid plans use credits.
create or replace function public.reserve_arch_coach_access(
  p_user_id uuid,
  p_cost integer default 4,
  p_thread_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.arch_coach_credit_accounts%rowtype;
  v_usage public.arch_coach_usage%rowtype;
  v_from_monthly integer := 0;
  v_from_purchased integer := 0;
  v_needed integer := greatest(p_cost, 0);
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_USER');
  end if;

  insert into public.arch_coach_credit_accounts(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_account
  from public.arch_coach_credit_accounts
  where user_id = p_user_id
  for update;

  -- Free Explore account: 10 questions, no card required.
  if v_account.plan_code = 'explore' then
    insert into public.arch_coach_usage(user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

    select * into v_usage
    from public.arch_coach_usage
    where user_id = p_user_id
    for update;

    if v_usage.free_questions_used >= 10 then
      return jsonb_build_object(
        'ok', false,
        'code', 'FREE_LIMIT_REACHED',
        'free_questions_remaining', 0,
        'plan_code', v_account.plan_code
      );
    end if;

    update public.arch_coach_usage
      set free_questions_used = free_questions_used + 1,
          updated_at = now()
      where user_id = p_user_id;

    return jsonb_build_object(
      'ok', true,
      'access_type', 'free_question',
      'free_questions_remaining', 9 - v_usage.free_questions_used,
      'credits_remaining', 0,
      'plan_code', v_account.plan_code
    );
  end if;

  -- Paid plans: monthly credits first, then purchased top-up credits.
  if (v_account.monthly_credits_remaining + v_account.purchased_credits_remaining) < v_needed then
    return jsonb_build_object(
      'ok', false,
      'code', 'INSUFFICIENT_CREDITS',
      'credits_remaining', v_account.monthly_credits_remaining + v_account.purchased_credits_remaining,
      'plan_code', v_account.plan_code
    );
  end if;

  v_from_monthly := least(v_account.monthly_credits_remaining, v_needed);
  v_from_purchased := v_needed - v_from_monthly;

  update public.arch_coach_credit_accounts
    set monthly_credits_remaining = monthly_credits_remaining - v_from_monthly,
        purchased_credits_remaining = purchased_credits_remaining - v_from_purchased,
        updated_at = now()
    where user_id = p_user_id;

  insert into public.arch_coach_credit_ledger(user_id, delta, reason, metadata, thread_id)
  values (
    p_user_id,
    -v_needed,
    'arch_coach_question',
    jsonb_build_object('monthly_used', v_from_monthly, 'purchased_used', v_from_purchased),
    p_thread_id
  );

  return jsonb_build_object(
    'ok', true,
    'access_type', 'credits',
    'credits_charged', v_needed,
    'credits_remaining', (v_account.monthly_credits_remaining + v_account.purchased_credits_remaining) - v_needed,
    'plan_code', v_account.plan_code,
    'monthly_used', v_from_monthly,
    'purchased_used', v_from_purchased
  );
end;
$$;

-- Refund a reservation if the AI request fails.
create or replace function public.refund_arch_coach_access(
  p_user_id uuid,
  p_access_type text,
  p_monthly_used integer default 0,
  p_purchased_used integer default 0,
  p_thread_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_access_type = 'free_question' then
    update public.arch_coach_usage
      set free_questions_used = greatest(free_questions_used - 1, 0),
          updated_at = now()
      where user_id = p_user_id;
  elsif p_access_type = 'credits' then
    update public.arch_coach_credit_accounts
      set monthly_credits_remaining = monthly_credits_remaining + greatest(p_monthly_used, 0),
          purchased_credits_remaining = purchased_credits_remaining + greatest(p_purchased_used, 0),
          updated_at = now()
      where user_id = p_user_id;

    insert into public.arch_coach_credit_ledger(user_id, delta, reason, metadata, thread_id)
    values (
      p_user_id,
      greatest(p_monthly_used, 0) + greatest(p_purchased_used, 0),
      'arch_coach_refund',
      jsonb_build_object('monthly_refund', greatest(p_monthly_used, 0), 'purchased_refund', greatest(p_purchased_used, 0)),
      p_thread_id
    );
  end if;
end;
$$;

-- Only the trusted server role should execute these money/usage functions.
revoke all on function public.reserve_arch_coach_access(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.refund_arch_coach_access(uuid, text, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.reserve_arch_coach_access(uuid, integer, uuid) to service_role;
grant execute on function public.refund_arch_coach_access(uuid, text, integer, integer, uuid) to service_role;

comment on function public.reserve_arch_coach_access is 'Server-only gate for DrawUp Arch Coach. Explore gets 10 free questions; paid plans consume credits.';
