# Production Checklist — manual steps

Code-side work is done (see git log). These need dashboard access:

## 0. Stray Aid Map / Delivery — missing tables (verified 2026-07-12)

The map loads (5 shelters, full bilingual data), but two features are 100% broken
because their tables were never created in production:

- `donation_pledges` — MISSING. The entire **Stray Aid Delivery portal** and the
  "live logistics" overlay on the map fail on every load. Run **SUPABASE_MIGRATIONS.md §16**.
- `map_location_submissions` — MISSING. The map's "suggest a location" feature fails
  silently. Run **SUPABASE_MIGRATIONS.md §14/§15** (submissions table + policies).

After running, hard-refresh both pages and confirm no console errors.

### ⚠️ Security: public signup is ENABLED
Anyone can create an account via the delivery portal's courier signup. It is gated by
email confirmation (a fresh signup gets NO session until the email is confirmed), but a
confirmed user has the `authenticated` role. If any CONTENT table (members, posts,
projects, focus_themes, departments, project_categories) uses a
`FOR ALL TO authenticated USING(true)` policy, a confirmed courier can edit site content.
Fix: change those tables' write policies to `is_admin()` (or an admin-OR-member check),
same pattern as admin_users §0.5. Verify with:
`SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname='public';`


## 1. Run the SQL migration (fixes team + projects pages) — URGENT
Supabase Dashboard → SQL Editor → run **section 0** of `SUPABASE_MIGRATIONS.md`:
```sql
ALTER TABLE members  ADD COLUMN IF NOT EXISTS school text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS video_url text;
```
Without this, the team page shows no members and the projects page shows no projects
(the queries reference these columns and fail). Verified missing on 2026-07-12.

## 2. Deploy
`npx wrangler deploy` from the repo root, or (better) connect the GitHub repo in
Cloudflare Dashboard → Workers & Pages → taiwanteentrust → Builds, so master auto-deploys.

## 3. Application email notifications
1. Create a free https://resend.com account, get an API key.
2. `npx supabase functions deploy notify-application`
3. Supabase Dashboard → Edge Functions → Secrets: set `RESEND_API_KEY` and `NOTIFY_EMAIL`.
4. Dashboard → Database → Webhooks → new webhook: table `join_applications`,
   event INSERT, type "Supabase Edge Function" → `notify-application`.
5. Submit a test application and confirm the email arrives.

## 4. Analytics (optional, 5 min)
Cloudflare Dashboard → Web Analytics → add site → copy the snippet into each page
before `</body>`, and add `https://static.cloudflareinsights.com` to the CSP
`script-src` in `site/_headers`.

## 5. Stronger spam protection (when needed)
A honeypot field is live on the join form. If bot submissions still get through,
add Cloudflare Turnstile: get a site key (CF Dashboard → Turnstile), render the
widget in join.html, and verify the token in an edge function before insert.

## 6. Content (admin panel)
- Fill `value_en` / `title_en` etc. for posts, projects, and site content —
  otherwise the English site shows Chinese for DB-loaded content.
- Review the homepage partners marquee (`index.html`, "合作夥伴與支持機構"):
  only list organizations with a real formalized relationship.

## Security audit (2026-07-12)

Verified good:
- ✅ Anon key: public tables readable, all writes blocked (tested members, posts,
  departments, storage uploads); `join_applications` / `admin_users` not readable
- ✅ admin-users edge function checks JWT + admin role server-side
- ✅ All user/DB content rendered with esc() — no XSS found (blog, team, admin applications)
- ✅ No secrets committed to the repo (only the public anon key, which is by design)
- ✅ Live headers: CSP, HSTS, X-Frame-Options DENY, nosniff, admin noindex
- ✅ 404 page, /admin + /map redirects working

Action needed:
- ⚠️ **Run SUPABASE_MIGRATIONS.md §0.5** — if `admin_users` is writable by any
  authenticated user (the admin UI edits roles via direct DB update, so it likely is),
  an invited *member* can promote themselves to admin. §0.5 locks writes to admins.
- Redeploy the admin-users edge function (`npx supabase functions deploy admin-users`)
  to pick up the 10-character password minimum.

Known/accepted risks:
- Content tables are writable by ALL authenticated users (member role incl.) — the
  admin/member split is UI-only. Acceptable while all invited users are trusted;
  add is_admin()-based policies per table if that changes.
- `increment_reach` RPC can be spammed to inflate the visit counter (vanity metric).
- Join form can be flooded via direct API (honeypot is client-side); Turnstile is the fix (§5).
- CSP allows 'unsafe-inline' scripts — required by the current inline-script architecture.
