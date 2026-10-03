-- DrawUp V13 — refund failed Arch Coach reservations (credits or anonymous guest question)
create or replace function public.refund_arch_coach_v13_access(
  p_user_id uuid,
  p_is_anonymous boolean,
  p_monthly_used integer default 0,
  p_purchased_used integer default 0,
  p_action text default 'failed_request'
) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if p_user_id is null then return jsonb_build_object('ok',false,'code','NO_USER'); end if;
  if coalesce(p_is_anonymous,false) then
    update public.arch_coach_usage set free_questions_used=greatest(free_questions_used-1,0),updated_at=now() where user_id=p_user_id;
    return jsonb_build_object('ok',true,'refunded','guest_question');
  end if;
  update public.arch_coach_credit_accounts
  set monthly_credits_remaining=monthly_credits_remaining+greatest(p_monthly_used,0),
      purchased_credits_remaining=purchased_credits_remaining+greatest(p_purchased_used,0),updated_at=now()
  where user_id=p_user_id;
  insert into public.arch_coach_credit_ledger(user_id,delta,reason,metadata)
  values(p_user_id,greatest(p_monthly_used,0)+greatest(p_purchased_used,0),'arch_coach_v13_refund',jsonb_build_object('action',p_action));
  return jsonb_build_object('ok',true,'refunded',greatest(p_monthly_used,0)+greatest(p_purchased_used,0));
end; $$;
revoke all on function public.refund_arch_coach_v13_access(uuid,boolean,integer,integer,text) from public,anon,authenticated;
grant execute on function public.refund_arch_coach_v13_access(uuid,boolean,integer,integer,text) to service_role;
