# Production Checklist — manual steps

Code-side work is done (see git log). These need dashboard access:

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

## RLS status (verified 2026-07-12, as anonymous key)
- ✅ public tables readable, writes blocked (tested members, posts, departments)
- ✅ `join_applications` / `admin_users` not readable by anon
- ✅ join form INSERT works for anon
