# Supabase 資料庫 Migration

請於 Supabase Dashboard → SQL Editor 中執行下列 SQL 以新增本次需要的欄位與資料表。

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
```

## 5. 確認 Storage bucket `media` 存在

後台會將圖片/影片上傳至 `media` bucket 下的 `posts/`、`projects/`、`focus/` 子資料夾。
若尚未建立 bucket，請至 Supabase → Storage → New bucket 建立 `media` 並設為 public。

## 6. `members` 表新增 `photo` 欄位（團隊成員大頭照）

```sql
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS photo text;
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
