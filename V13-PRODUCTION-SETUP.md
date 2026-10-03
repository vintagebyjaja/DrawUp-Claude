# DrawUp V13 — Production setup

V13 is intended to let the founder experience DrawUp more like a real user while keeping production data honest: no fictional firms, no fake community counts, and missing facts remain unverified instead of being invented.

## 1. Deploy the GitHub package
Upload the contents of **DrawUp V13 - GitHub.zip** to the SAME GitHub repository already connected to Netlify. Do not create a new Netlify site. `tsconfig.json` continues to exclude `supabase/functions/**` from the Next.js typecheck.

## 2. Apply the Supabase package
In the existing DrawUp Supabase project, run the new migration `0015_v13_production_profiles_and_saved_items.sql` after the existing migrations. Then deploy the included `arch-coach` and `drawup-search` Edge Functions. Keep `OPENAI_API_KEY` in Supabase Secrets; never put it in GitHub or browser code.

## 3. Set up your founder account
1. On drawup.studio, create/sign in to the account you want to own DrawUp.
2. Supabase Dashboard → Authentication → Users → open that user → copy the UUID.
3. Supabase → SQL Editor → run the following after replacing the values:

```sql
update public.profiles
set account_type = 'founder',
    title = 'Founder & CEO',
    display_name = 'YOUR PUBLIC NAME',
    username = 'YOUR_USERNAME',
    profile_verified = true,
    founder_since = current_date,
    bio = 'Founder of DrawUp — an AEC platform for discovering, connecting, checking, learning and drawing up what comes next.',
    current_location = 'Charlotte, NC',
    website = 'https://drawup.studio'
where id = 'YOUR_AUTH_USER_UUID';
```

Use the public name/title you actually want users to see. The founder role inherits DrawUp admin permissions through the existing `is_drawup_admin()` function.

## 4. Build your personal/professional profile
After the founder row is active, fill in only information you want public. Recommended production fields:
- display name
- username
- profile photo/avatar URL
- title
- professional level
- current location
- employer/firm
- school, degree and education history
- disciplines
- credentials
- bio
- website / LinkedIn / Instagram

Keep `is_public=true` only if you want the profile discoverable. Student verification documents remain separate/private and should never be shown on a public profile.

## 5. Production smoke test
Test as both founder and normal user: sign-up/sign-in, mobile bottom navigation, Discover search, ambiguous search clarification, exact firm A–Z filters, firm profile routing, all 50 state-code buttons, university profiles, organization resources, Arch Coach, saved items, and failure messages. Test laptop at 100% browser zoom and phone at normal zoom.

## V13 behavior to verify
- No Atlas & Finch, Ashgrove Partners, Example Studio, or other fictional U.S. firm cards.
- Firm letter filter is exact: H shows only H firms.
- Clicking a firm opens that firm's DrawUp profile, not a shared sample profile.
- Ambiguous search can ask city/state/country before choosing an entity.
- State Code Directory exposes all 50 states.
- AIA/NOMA/AIAS/NOMAS/NCARB/NAAB/NSBE resources are represented in their respective areas.
- Mobile bottom nav remains visible by default and clearly highlights the active page.
- Desktop/laptop layouts fit at 100% browser zoom without horizontal clipping.
