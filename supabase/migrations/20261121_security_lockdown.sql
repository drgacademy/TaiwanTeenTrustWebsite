-- ============================================================
-- Security lockdown — SUPABASE_MIGRATIONS.md §0, §0.5, §0.6 in one script
-- Run once in Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- What it does
--   §0   Adds the 3 missing columns the team / projects / map pages need.
--   §0.5 Only admins can change or delete rows in admin_users
--        (stops a member promoting themselves to admin).
--   §0.6 Only back-office users (anyone listed in admin_users) can write
--        the website content tables. Volunteer couriers who sign up on
--        the delivery portal can no longer edit the site.
--   PII  Join applications and newsletter emails can only be read by
--        back-office users. The public forms can still submit.
--
-- Read access to website content is NOT changed (existing SELECT policies stay).
-- donation_pledges and map_location_submissions are NOT touched.
-- ============================================================

BEGIN;

-- ── §0  Missing columns ─────────────────────────────────────
ALTER TABLE members       ADD COLUMN IF NOT EXISTS school    text;
ALTER TABLE projects      ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE map_locations ADD COLUMN IF NOT EXISTS video_url text;

-- ── Helper functions (SECURITY DEFINER avoids RLS recursion) ──
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND role = 'admin') $$;

CREATE OR REPLACE FUNCTION is_staff() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()) $$;

-- ── §0.6  Content tables: staff-only writes ─────────────────
DO $$
DECLARE
  r record;
  t text;
  content_tables text[] := ARRAY[
    'members','posts','projects','focus_themes',
    'departments','project_categories','site_content','map_locations'
  ];
BEGIN
  -- Drop every existing write policy (ALL / INSERT / UPDATE / DELETE) on these
  -- tables. Postgres ORs policies together, so one loose "authenticated can
  -- write" policy left behind would defeat the lock.
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(content_tables)
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  LOOP
    RAISE NOTICE 'Dropping write policy % on %', r.policyname, r.tablename;
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;

  FOREACH t IN ARRAY content_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Table % does not exist, skipped', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Dropping an ALL policy can also remove read access; keep the site readable.
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', t || '_select_all', t);
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff())',
      t || '_write_staff', t);
  END LOOP;
END $$;

-- ── §0.5  admin_users: admin-only changes ───────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_users'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  LOOP
    RAISE NOTICE 'Dropping write policy % on admin_users', r.policyname;
    EXECUTE format('DROP POLICY %I ON public.admin_users', r.policyname);
  END LOOP;

  ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

  -- Back office needs to read its own role; staff can see the team list.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'admin_users' AND cmd = 'SELECT') THEN
    CREATE POLICY admin_users_select_staff ON public.admin_users
      FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_staff());
  END IF;

  CREATE POLICY admin_users_update_admin_only ON public.admin_users
    FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  CREATE POLICY admin_users_delete_admin_only ON public.admin_users
    FOR DELETE TO authenticated USING (is_admin());
  -- No INSERT policy: invitations go through the admin-users edge function (service role).
END $$;

-- ── Personal data: applications + newsletter emails are staff-only to read ──
-- The public join form and newsletter box must still be able to INSERT.
DO $$
DECLARE
  r record;
  t text;
  pii_tables text[] := ARRAY['join_applications','newsletter_subscriptions'];
BEGIN
  FOREACH t IN ARRAY pii_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Table % does not exist, skipped', t;
      CONTINUE;
    END IF;

    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND cmd IN ('ALL', 'SELECT', 'UPDATE', 'DELETE')
    LOOP
      RAISE NOTICE 'Dropping read/write policy % on %', r.policyname, t;
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Keep the public form working (an ALL policy we just dropped may have covered INSERT).
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = t AND cmd = 'INSERT') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)',
                     t || '_insert_public', t);
    END IF;

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_staff())', t || '_select_staff', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (is_staff()) WITH CHECK (is_staff())', t || '_update_staff', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_admin())', t || '_delete_admin', t);
  END LOOP;
END $$;

COMMIT;

-- ── Result: the policies now in place ───────────────────────
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('members','posts','projects','focus_themes','departments',
                    'project_categories','site_content','map_locations','admin_users',
                    'join_applications','newsletter_subscriptions')
ORDER BY tablename, cmd;
