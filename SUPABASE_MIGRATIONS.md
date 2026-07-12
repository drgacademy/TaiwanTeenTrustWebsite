# Supabase 資料庫 Migration

請於 Supabase Dashboard → SQL Editor 中執行下列 SQL 以新增本次需要的欄位與資料表。

## 0. ⚠️ 尚未執行 — 請立即執行（2026-07-12 確認 production 缺少這兩個欄位）

缺少這兩個欄位會讓「團隊」與「專案」頁面的查詢整個失敗，前台顯示空白（成員 / 專案不出現），後台儲存成員也會失敗：

```sql
ALTER TABLE members  ADD COLUMN IF NOT EXISTS school text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS video_url text;
```

執行後開啟 https://taiwanteentrust.org/team.html 確認成員出現。

## 1. `posts` 表新增 `image_url` 欄位（部落格特色圖片）

```sql
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS image_url text;
```

## 2. `projects` 表新增 `image_url` 與 `video_url` 欄位（專案媒體）

```sql
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS video_url text;
```

## 3. `admin_users` 表新增 `role` 欄位（區分管理員 / 團員）

```sql
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
  CHECK (role IN ('admin', 'member'));

-- 將既有資料保留為團員（已是預設值）
-- 如要把某些既有帳號設為管理員：
-- UPDATE admin_users SET role = 'admin' WHERE email = 'george@drg.best';
```

## 4. 新增 `focus_themes` 表（年度主題）

```sql
CREATE TABLE IF NOT EXISTS focus_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','planned')),
  title_zh text NOT NULL,
  title_en text,
  icon text,
  color text,
  why_zh text,
  why_en text,
  response_zh text,
  response_en text,
  image_url text,
  video_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS focus_themes_set_updated_at ON focus_themes;
CREATE TRIGGER focus_themes_set_updated_at
  BEFORE UPDATE ON focus_themes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS 政策（已登入使用者可讀寫，匿名使用者只能讀）
ALTER TABLE focus_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "focus_themes_select_all"
  ON focus_themes FOR SELECT USING (true);

CREATE POLICY "focus_themes_write_authenticated"
  ON focus_themes FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- 預設 2026 年度主題資料（與前台靜態 fallback 對齊）
INSERT INTO focus_themes (year, status, title_zh, title_en, icon, color, why_zh, why_en, response_zh, response_en)
VALUES (
  2026,
  'active',
  '流浪動物救援行動',
  'Stray Animal Rescue Initiative',
  '🐾',
  '#00c95d',
  '台灣每年有超過10萬隻流浪動物，公立收容所普遍超載，安樂死率依然偏高。許多愛心人士想幫助卻不知道資源在哪裡。問題不是愛心不夠，而是資訊太分散。',
  'Taiwan has over 100,000 stray animals each year. Public shelters are overcrowded and euthanasia rates remain high. Many compassionate people want to help but can''t find resources. The problem isn''t a lack of compassion — it''s fragmented information.',
  '推出「浪浪援助地圖（Stray Aid Map）」——全台第一個由青年主導的流浪動物救援資訊平台。整合收容所、動物醫院與餵食站的即時數據，讓每一隻動物都被看見。',
  'Launching "Stray Aid Map" — Taiwan''s first youth-led stray animal rescue platform. Integrating real-time data from shelters, veterinary clinics, and feeding stations so every animal is seen and every caring person finds the right resources.'
);
```

## 5. 確認 Storage bucket `media` 存在

後台會將圖片/影片上傳至 `media` bucket 下的 `posts/`、`projects/`、`focus/` 子資料夾。
若尚未建立 bucket，請至 Supabase → Storage → New bucket 建立 `media` 並設為 public。

## 6. `members` 表新增 `photo` 與 `is_lead` 欄位

```sql
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS photo text,
  ADD COLUMN IF NOT EXISTS is_lead boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS school text;
```

## 7. 新增 `project_categories` 表（專案分類管理）

```sql
CREATE TABLE IF NOT EXISTS project_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label_zh text NOT NULL,
  label_en text,
  color text,
  icon text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 預設分類資料
INSERT INTO project_categories (key, label_zh, label_en, color, icon, sort_order) VALUES
  ('animals', '動物', 'Animals', '#00c95d', '🐾', 1),
  ('environment', '環境', 'Environment', '#008800', '🌿', 2),
  ('community', '社區', 'Community', '#0099ff', '🤝', 3),
  ('arts', '藝術文化', 'Arts', '#7c3aff', '🎭', 4),
  ('advocacy', '倡議', 'Advocacy', '#ff8c00', '📣', 5),
  ('research', '研究', 'Research', '#0099ff', '🔬', 6),
  ('education', '教育', 'Education', '#ff3b3b', '📚', 7)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE project_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_categories_select_all"
  ON project_categories FOR SELECT USING (true);
CREATE POLICY "project_categories_write_authenticated"
  ON project_categories FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

## 8. 新增 `departments` 表（團隊部門管理）

```sql
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label_zh text NOT NULL,
  label_en text,
  color text,
  icon text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 預設部門資料（key 用中文以對應現有 members.dept 欄位資料）
INSERT INTO departments (key, label_zh, label_en, color, icon, sort_order) VALUES
  ('資訊科技', '資訊科技', 'Information Technology', '#0099ff', '🖥️', 1),
  ('設計', '設計', 'Design', '#ff2dca', '🎨', 2),
  ('行銷', '行銷', 'Marketing', '#ff8c00', '📣', 3),
  ('影像', '影像', 'Video & Media', '#ff3b3b', '🎬', 4),
  ('研究', '研究', 'Research', '#00c95d', '🔬', 5),
  ('活動', '活動', 'Events', '#7c3aff', '🗓️', 6),
  ('財務', '財務', 'Finance', '#ffd600', '💰', 7)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select_all"
  ON departments FOR SELECT USING (true);
CREATE POLICY "departments_write_authenticated"
  ON departments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

## 9. （選用）admin-users Edge Function 支援 role 欄位

目前邀請流程透過 edge function `admin-users` 寫入 auth users + admin_users。
若希望邀請時直接寫入指定 role，可於 edge function 中將 POST body 的 `role` 欄位寫入 admin_users。
若 edge function 暫不支援 role，`Admins.invite` 仍可正常運作，僅是新邀請的 user role 會等於資料庫預設值（`member`）。

## 10. 修正 `admin_users` 缺少 UPDATE 政策（重要）

若編輯後台使用者時出現 "Cannot coerce the result to a single JSON object" 錯誤，
代表 RLS 缺少 UPDATE 政策，請執行：

```sql
-- 加入 UPDATE 政策（is_admin() 才可更新）
CREATE POLICY "admin_users_update"
  ON admin_users FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
```

## 11. `posts` 表新增 `date` 欄位（部落格發布日期）

若新增 / 編輯部落格文章時出現 "Could not find the 'date' column of 'posts'" 錯誤，
代表表格缺少此欄位，請執行：

```sql
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS date date;

-- （選用）將既有資料的 created_at 填入 date
UPDATE posts SET date = created_at::date WHERE date IS NULL;
```

## 12. admin-users Edge Function 支援 setPassword 動作（直接設定密碼）

若希望可以在後台直接輸入新密碼（不寄信），需要在 edge function 中加入 `setPassword` 處理：

```typescript
// 在 admin-users edge function 的 POST handler 中加入：
if (body.action === 'setPassword') {
  const { userId, password } = body;
  if (!userId || !password) {
    return new Response(JSON.stringify({ error: 'userId and password required' }), { status: 400 });
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), { status: 400 });
  }
  // 使用 service role key 建立的 admin client
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
```

呼叫端送入 body 為：`{ "action": "setPassword", "userId": "<auth user id>", "password": "<新密碼>" }`。

⚠️ 注意：`Admins.setPassword(userId, ...)` 是傳入 `admin_users.user_id` (= auth user id)，
若前端是傳 `admin_users.id`，需要先在 edge function 內查表轉換，
或改成在前端傳入 `user_id`。

## 13. `map_locations` 重整為流浪動物中心專用 + 預載 5 個中心

### 13.1 新增欄位

```sql
ALTER TABLE map_locations
  ADD COLUMN IF NOT EXISTS image_url    text,                    -- 中心主圖（前台展示用）
  ADD COLUMN IF NOT EXISTS food_weeks   numeric,                 -- 飼料存量（週）
  ADD COLUMN IF NOT EXISTS needs        jsonb DEFAULT '[]'::jsonb, -- 缺乏物資清單
  ADD COLUMN IF NOT EXISTS custom_needs text;                    -- 自由輸入的其他物資/說明
```

`needs` 欄位的格式（陣列，每個項目代表一種物資）：

```json
[
  { "key": "dry_food",  "label_zh": "乾飼料",     "label_en": "Dry food",         "level": "urgent" },
  { "key": "canned",    "label_zh": "罐頭食品",   "label_en": "Canned food",      "level": "normal" },
  { "key": "medical",   "label_zh": "醫療費補助", "label_en": "Medical funding",  "level": "urgent" }
]
```

`level` 可以是：
- `"urgent"` — 急需（紅色標籤）
- `"normal"` — 缺乏（一般標籤）
- `"none"` 或不存在 — 不缺（不會顯示）

### 13.2 清除舊類型資料（如果 vet/feed/rescue 沒在用）

```sql
-- 確認後再執行：刪除非收容所類型的資料點
DELETE FROM map_locations WHERE type IS NULL OR type IN ('vet','feed','rescue');

-- 也可以把 type 全部統一成 shelter（保險做法）
UPDATE map_locations SET type = 'shelter' WHERE type IS NULL OR type <> 'shelter';
```

### 13.3 預載 5 個流浪動物中心

```sql
-- 注意：執行前確認 map_locations 沒有同名資料，避免重複
INSERT INTO map_locations
  (name, name_en, type, status, address, address_en, phone, hours, hours_en, lat, lng, food_weeks, needs)
VALUES
  ('臺北市動物之家', 'Taipei Animal Shelter', 'shelter', 'active',
   '台北市北投區立農街二段350號', '350 Linong St. Sec.2, Beitou, Taipei',
   '02-2858-3700', '週二–週日 09:00–17:00', 'Tue–Sun 09:00–17:00',
   25.1306, 121.4984, 1.5,
   '[
     {"key":"dry_food","label_zh":"乾飼料","label_en":"Dry food","level":"urgent"},
     {"key":"canned","label_zh":"罐頭食品","label_en":"Canned food","level":"urgent"},
     {"key":"medical","label_zh":"醫療費補助","label_en":"Medical funding","level":"normal"},
     {"key":"volunteers","label_zh":"志工","label_en":"Volunteers","level":"normal"}
   ]'::jsonb),

  ('新北市動物之家（新莊）', 'New Taipei Animal Shelter (Xinzhuang)', 'shelter', 'active',
   '新北市新莊區化成路321巷8號', '8 Lane 321 Huacheng Rd., Xinzhuang, New Taipei',
   '02-2991-3062', '週二–週日 09:00–17:00', 'Tue–Sun 09:00–17:00',
   25.0353, 121.4397, 3.0,
   '[
     {"key":"dry_food","label_zh":"乾飼料","label_en":"Dry food","level":"normal"},
     {"key":"cleaning","label_zh":"清潔用品","label_en":"Cleaning supplies","level":"normal"}
   ]'::jsonb),

  ('台中市動物之家（北屯）', 'Taichung Animal Shelter (Beitun)', 'shelter', 'active',
   '台中市北屯區東山路一段201號', '201 Dongshan Rd. Sec.1, Beitun, Taichung',
   '04-2239-0079', '週二–週日 09:00–17:00', 'Tue–Sun 09:00–17:00',
   24.1830, 120.7025, 5.5,
   '[
     {"key":"donations","label_zh":"長期捐款支持","label_en":"Regular donations","level":"normal"},
     {"key":"volunteers","label_zh":"志工","label_en":"Volunteers","level":"normal"}
   ]'::jsonb),

  ('台南市動物之家（楠西）', 'Tainan Animal Shelter (Nanxi)', 'shelter', 'active',
   '台南市楠西區東勢里6鄰64號', '64 Dongshi Village, Nanxi, Tainan',
   '06-575-2367', '週二–週日 09:00–17:00', 'Tue–Sun 09:00–17:00',
   23.1968, 120.5058, 2.5,
   '[
     {"key":"dry_food","label_zh":"乾飼料","label_en":"Dry food","level":"urgent"},
     {"key":"canned","label_zh":"罐頭食品","label_en":"Canned food","level":"normal"},
     {"key":"surgery","label_zh":"手術費補助","label_en":"Surgery funding","level":"normal"}
   ]'::jsonb),

  ('高雄市動物之家（燕巢）', 'Kaohsiung Animal Shelter (Yanchao)', 'shelter', 'active',
   '高雄市燕巢區角宿里深水路242號', '242 Shenshui Rd., Yanchao, Kaohsiung',
   '07-616-1161', '週二–週日 09:00–17:00', 'Tue–Sun 09:00–17:00',
   22.7856, 120.3648, 0.8,
   '[
     {"key":"dry_food","label_zh":"乾飼料","label_en":"Dry food","level":"urgent"},
     {"key":"canned","label_zh":"罐頭食品","label_en":"Canned food","level":"urgent"},
     {"key":"cleaning","label_zh":"清潔用品","label_en":"Cleaning supplies","level":"normal"},
     {"key":"medical","label_zh":"醫療費補助","label_en":"Medical funding","level":"urgent"},
     {"key":"volunteers","label_zh":"志工","label_en":"Volunteers","level":"normal"}
   ]'::jsonb);
```

## 14. 2026-05-24 Security & Audit Migrations

### 14.1 `focus_themes` RLS Policy Update
```sql
-- Add user_id column if not exists
ALTER TABLE focus_themes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();

-- Enable RLS
ALTER TABLE focus_themes ENABLE ROW LEVEL SECURITY;

-- Drop existing focus_themes policies
DROP POLICY IF EXISTS "focus_themes_select_all" ON focus_themes;
DROP POLICY IF EXISTS "focus_themes_write_authenticated" ON focus_themes;

-- Create policies: anyone can read
CREATE POLICY "focus_themes_select_all"
  ON focus_themes FOR SELECT USING (true);

-- Authenticated users can only insert/update/delete their own data
CREATE POLICY "focus_themes_insert_own"
  ON focus_themes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "focus_themes_update_own"
  ON focus_themes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "focus_themes_delete_own"
  ON focus_themes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
```

### 14.2 `newsletter_subscriptions` Table
```sql
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE newsletter_subscriptions ENABLE ROW LEVEL SECURITY;

-- Public can subscribe
CREATE POLICY "newsletter_subscriptions_insert_public"
  ON newsletter_subscriptions FOR INSERT WITH CHECK (true);

-- Authenticated users (admins/members) can view subscriptions
CREATE POLICY "newsletter_subscriptions_select_authenticated"
  ON newsletter_subscriptions FOR SELECT TO authenticated USING (true);
```

### 14.3 `audit_logs` Table & Triggers
```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  action_type text NOT NULL,
  record_id text NOT NULL,
  pre_image jsonb,
  post_image jsonb,
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS (only authenticated can read)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_authenticated"
  ON audit_logs FOR SELECT TO authenticated USING (true);

-- Trigger function for audit logging
CREATE OR REPLACE FUNCTION audit_trigger_func() RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
  v_record_id text;
  v_pre jsonb := null;
  v_post jsonb := null;
BEGIN
  -- Safely extract user_id if authenticated
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := null;
  END;

  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id::text;
    v_pre := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id::text;
    v_pre := to_jsonb(OLD);
    v_post := to_jsonb(NEW);
  ELSE
    v_record_id := NEW.id::text;
    v_post := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_logs (table_name, action_type, record_id, pre_image, post_image, user_id)
  VALUES (TG_TABLE_NAME, TG_OP, v_record_id, v_pre, v_post, v_user_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach triggers to relevant tables
DROP TRIGGER IF EXISTS audit_focus_themes ON focus_themes;
CREATE TRIGGER audit_focus_themes AFTER INSERT OR UPDATE OR DELETE ON focus_themes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_members ON members;
CREATE TRIGGER audit_members AFTER INSERT OR UPDATE OR DELETE ON members
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_projects ON projects;
CREATE TRIGGER audit_projects AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_posts ON posts;
CREATE TRIGGER audit_posts AFTER INSERT OR UPDATE OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

## 15. 2026-05-31 Security & RLS Policies Migration

### 15.1 Helper Functions
```sql
-- Check if current authenticated user has an 'admin' role
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current authenticated user is a member (either member or admin)
CREATE OR REPLACE FUNCTION is_member() RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 15.2 Ownership Columns
```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE members ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
```

### 15.3 Map Location Submissions Table
```sql
CREATE TABLE IF NOT EXISTS map_location_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  address text,
  facebook text,
  instagram text,
  website text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS map_location_submissions_set_updated_at ON map_location_submissions;
CREATE TRIGGER map_location_submissions_set_updated_at
  BEFORE UPDATE ON map_location_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Attach triggers to relevant tables
DROP TRIGGER IF EXISTS audit_map_location_submissions ON map_location_submissions;
CREATE TRIGGER audit_map_location_submissions AFTER INSERT OR UPDATE OR DELETE ON map_location_submissions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

### 15.4 Enable RLS & Define Policies
```sql
-- 1. Enable RLS on all remaining tables
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_location_submissions ENABLE ROW LEVEL SECURITY;

-- 2. Define policies for posts
DROP POLICY IF EXISTS "posts_select_all" ON posts;
CREATE POLICY "posts_select_all" ON posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "posts_insert_own" ON posts;
CREATE POLICY "posts_insert_own" ON posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_update_own_or_admin" ON posts;
CREATE POLICY "posts_update_own_or_admin" ON posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "posts_delete_own_or_admin" ON posts;
CREATE POLICY "posts_delete_own_or_admin" ON posts FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR is_admin());

-- 3. Define policies for members
DROP POLICY IF EXISTS "members_select_all" ON members;
CREATE POLICY "members_select_all" ON members FOR SELECT USING (true);

DROP POLICY IF EXISTS "members_insert_admin" ON members;
CREATE POLICY "members_insert_admin" ON members FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "members_update_own_or_admin" ON members;
CREATE POLICY "members_update_own_or_admin" ON members FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "members_delete_admin" ON members;
CREATE POLICY "members_delete_admin" ON members FOR DELETE TO authenticated
  USING (is_admin());

-- 4. Define policies for projects
DROP POLICY IF EXISTS "projects_select_all" ON projects;
CREATE POLICY "projects_select_all" ON projects FOR SELECT USING (true);

DROP POLICY IF EXISTS "projects_modify_admin" ON projects;
CREATE POLICY "projects_modify_admin" ON projects FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- 5. Define policies for map_locations
DROP POLICY IF EXISTS "map_locations_select_all" ON map_locations;
CREATE POLICY "map_locations_select_all" ON map_locations FOR SELECT USING (true);

DROP POLICY IF EXISTS "map_locations_modify_admin" ON map_locations;
CREATE POLICY "map_locations_modify_admin" ON map_locations FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- 6. Define policies for map_location_submissions
DROP POLICY IF EXISTS "map_location_submissions_select_admin" ON map_location_submissions;
CREATE POLICY "map_location_submissions_select_admin" ON map_location_submissions FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "map_location_submissions_insert_public" ON map_location_submissions;
CREATE POLICY "map_location_submissions_insert_public" ON map_location_submissions FOR INSERT
  WITH CHECK (status = 'pending');

DROP POLICY IF EXISTS "map_location_submissions_modify_admin" ON map_location_submissions;
CREATE POLICY "map_location_submissions_modify_admin" ON map_location_submissions FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
```

## 16. 2026-05-31 Donation Pledges & Logistics System

### 16.1 Table Schema
```sql
CREATE TABLE IF NOT EXISTS donation_pledges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shelter_id uuid REFERENCES map_locations(id) ON DELETE CASCADE,
  donor_name text NOT NULL,
  donor_phone text NOT NULL,
  pickup_address text NOT NULL,
  pickup_lat numeric NOT NULL,
  pickup_lng numeric NOT NULL,
  donation_category text NOT NULL CHECK (donation_category IN ('Food & Water', 'Medical', 'Tools & Utilities', 'Shelter Materials', 'Other')),
  donation_items text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'picked_up', 'delivered', 'verified')),
  rider_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rider_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS donation_pledges_set_updated_at ON donation_pledges;
CREATE TRIGGER donation_pledges_set_updated_at
  BEFORE UPDATE ON donation_pledges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger for audit logging
DROP TRIGGER IF EXISTS audit_donation_pledges ON donation_pledges;
CREATE TRIGGER audit_donation_pledges AFTER INSERT OR UPDATE OR DELETE ON donation_pledges
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

### 16.2 RLS Policies
```sql
ALTER TABLE donation_pledges ENABLE ROW LEVEL SECURITY;

-- Public users can insert pending pledges
DROP POLICY IF EXISTS "donation_pledges_insert_public" ON donation_pledges;
CREATE POLICY "donation_pledges_insert_public" ON donation_pledges FOR INSERT
  WITH CHECK (status = 'pending' AND rider_id IS NULL);

-- Anyone can view pledges to track their own or find open pickups
DROP POLICY IF EXISTS "donation_pledges_select_all" ON donation_pledges;
CREATE POLICY "donation_pledges_select_all" ON donation_pledges FOR SELECT USING (true);

-- Riders can claim tasks and update statuses, admins can edit everything
DROP POLICY IF EXISTS "donation_pledges_update_rider" ON donation_pledges;
CREATE POLICY "donation_pledges_update_rider" ON donation_pledges FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (status = 'assigned' AND rider_id = auth.uid()) OR
    (rider_id = auth.uid() AND status IN ('picked_up', 'delivered')) OR
    is_admin()
  );

-- Only admins can delete pledges
DROP POLICY IF EXISTS "donation_pledges_delete_admin" ON donation_pledges;
CREATE POLICY "donation_pledges_delete_admin" ON donation_pledges FOR DELETE TO authenticated
  USING (is_admin());
```



