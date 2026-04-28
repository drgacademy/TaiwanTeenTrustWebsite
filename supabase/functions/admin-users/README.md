# `admin-users` Edge Function

管理後台帳號（`admin_users` 表 + `auth.users`）的 Supabase Edge Function。

## 端點

| Method | 動作 | Body / Query |
| --- | --- | --- |
| `GET` | 列出所有後台帳號 | — |
| `POST` | 邀請新使用者 | `{ email, name, role }` (`role` 為 `admin` 或 `member`) |
| `POST` | 直接設定密碼 | `{ action: "setPassword", userId, password }` |
| `DELETE` | 移除後台帳號 | `?id=<admin_users.id>` |

所有請求都需要：
- `Authorization: Bearer <user-access-token>` — 呼叫者必須是 `admin_users` 內 `role = 'admin'` 的使用者。
- `apikey: <SUPABASE_PUBLISHABLE_KEY>` — Supabase 平台規定的 anon/public key。

## 環境變數

需要在 Supabase Dashboard → Edge Functions → admin-users → Secrets 設定：

| 變數 | 說明 |
| --- | --- |
| `SUPABASE_URL` | 通常已自動注入 |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key（千萬不要外洩） |

## 部署

### 方法 1：使用 Supabase CLI（推薦）

```bash
# 1. 安裝 CLI（如尚未安裝）
npm install -g supabase

# 2. 登入
supabase login

# 3. 連結到你的專案（在專案根目錄執行）
supabase link --project-ref tpolpfulwsfqpghweasl

# 4. 部署這個 function
supabase functions deploy admin-users --no-verify-jwt
```

> `--no-verify-jwt` 是必要的，因為 function 內部會自行驗證 JWT 並對照 `admin_users` 表，
> 若交給 Supabase 平台預設驗證會擋掉非 service-role 的請求。

### 方法 2：在 Supabase Dashboard 上手動建立

1. 前往 Supabase Dashboard → Edge Functions → 新增 function（名稱 `admin-users`）
2. 在 「Verify JWT」設為 **關閉** （function 內部會自行驗證）
3. 把 `index.ts` 整段貼到編輯器中部署

## 安全性

- 呼叫者必須有 `admin_users.role = 'admin'`，否則會回 `403`。
- 預設不允許刪除自己。
- 設密碼前會先確認該 `userId` 真的存在於 `admin_users` 中，避免拿來改非後台帳號的密碼。
- 密碼長度至少 6 個字元。

## 與前端對應

`site/admin/js/admin.js` 中的 `Admins` 物件對應的呼叫：

| 前端 | HTTP | 說明 |
| --- | --- | --- |
| `Admins.list()` | `GET` | 取得所有 `admin_users` |
| `Admins.invite(email, name, role)` | `POST` | body 帶 `email/name/role` |
| `Admins.setPassword(userId, password)` | `POST` | body 帶 `action='setPassword'` |
| `Admins.remove(id)` | `DELETE` | query 帶 `id` |
| `Admins.update(id, patch)` | — | 直接走 Postgres，不經 edge function |
