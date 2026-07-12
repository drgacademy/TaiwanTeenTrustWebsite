// supabase/functions/admin-users/index.ts
// Edge function for admin user management.
// Endpoints:
//   GET    /functions/v1/admin-users           → list all admin_users (with email)
//   POST   /functions/v1/admin-users           → invite new user (body: { email, name, role })
//   POST   /functions/v1/admin-users           → set password   (body: { action: 'setPassword', userId, password })
//   DELETE /functions/v1/admin-users?id=<id>   → remove admin_users row + auth user

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  // ── CORS preflight ──
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Wrap everything in try-catch so unexpected errors return JSON, not "Failed to fetch" ──
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[admin-users] Missing env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'Server misconfigured: missing env vars' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Auth check: must have a valid bearer token ──
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return jsonResponse({ error: 'Empty bearer token' }, 401);
    }

    // Defensive: getUser may return error or null data
    let callerId: string | null = null;
    try {
      const result = await supabaseAdmin.auth.getUser(token);
      const user = result?.data?.user;
      if (result?.error || !user) {
        console.warn('[admin-users] getUser failed:', result?.error?.message);
        return jsonResponse({ error: 'Invalid or expired token' }, 401);
      }
      callerId = user.id;
    } catch (e) {
      console.error('[admin-users] getUser threw:', e);
      return jsonResponse({ error: 'Auth check failed' }, 401);
    }

    // ── Admin role check ──
    let callerRole: string | null = null;
    try {
      const { data, error } = await supabaseAdmin
        .from('admin_users')
        .select('role')
        .eq('user_id', callerId)
        .maybeSingle();
      if (error) {
        console.warn('[admin-users] role lookup failed:', error.message);
      }
      callerRole = data?.role ?? null;
    } catch (e) {
      console.error('[admin-users] role lookup threw:', e);
    }

    if (!callerRole) {
      return jsonResponse({ error: 'Not a backend user' }, 403);
    }
    if (callerRole !== 'admin') {
      return jsonResponse({ error: 'Admin role required' }, 403);
    }

    // ── Route ──
    if (req.method === 'GET') {
      return await handleList(supabaseAdmin);
    }
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body.action === 'setPassword') {
        return await handleSetPassword(supabaseAdmin, body);
      }
      return await handleInvite(supabaseAdmin, body);
    }
    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      const id = url.searchParams.get('id');
      return await handleDelete(supabaseAdmin, id, callerId!);
    }
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('[admin-users] Unhandled error:', e);
    return jsonResponse({ error: (e as Error)?.message || 'Server error' }, 500);
  }
});

async function handleList(supabase: SupabaseClient): Promise<Response> {
  try {
    const { data: admins, error } = await supabase
      .from('admin_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admin-users] list query failed:', error);
      return jsonResponse({ error: error.message }, 400);
    }

    const enriched = await Promise.all(
      (admins || []).map(async (a: any) => {
        if (a.email || !a.user_id) return a;
        try {
          const { data, error: getErr } = await supabase.auth.admin.getUserById(a.user_id);
          if (getErr) {
            console.warn('[admin-users] getUserById failed for', a.user_id, getErr.message);
            return a;
          }
          return { ...a, email: data?.user?.email || a.email };
        } catch (e) {
          console.warn('[admin-users] getUserById threw for', a.user_id, e);
          return a;
        }
      })
    );

    return jsonResponse({ admins: enriched });
  } catch (e) {
    console.error('[admin-users] handleList unhandled:', e);
    return jsonResponse({ error: (e as Error)?.message || 'List failed' }, 500);
  }
}

async function handleInvite(supabase: SupabaseClient, body: any): Promise<Response> {
  const email = (body.email || '').trim().toLowerCase();
  const name = (body.name || '').trim() || null;
  const role = body.role === 'admin' ? 'admin' : 'member';
  const redirectTo: string | undefined = body.redirectTo || undefined;

  if (!email) return jsonResponse({ error: 'Email is required' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Invalid email format' }, 400);
  }

  const { data: existing } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing) return jsonResponse({ error: 'This email is already a backend user' }, 409);

  const { data: invite, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    email,
    redirectTo ? { redirectTo } : {}
  );
  if (inviteErr || !invite?.user) {
    return jsonResponse({ error: inviteErr?.message || 'Failed to send invite' }, 400);
  }

  const userId = invite.user.id;
  const { data: admin, error: insertErr } = await supabase
    .from('admin_users')
    .insert({ user_id: userId, email, name, role })
    .select()
    .single();

  if (insertErr) {
    await supabase.auth.admin.deleteUser(userId).catch(() => {});
    return jsonResponse({ error: insertErr.message }, 400);
  }

  return jsonResponse({ admin });
}

async function handleSetPassword(supabase: SupabaseClient, body: any): Promise<Response> {
  const userId = (body.userId || '').trim();
  const password = body.password || '';

  if (!userId) return jsonResponse({ error: 'userId is required' }, 400);
  if (!password) return jsonResponse({ error: 'password is required' }, 400);
  if (typeof password !== 'string' || password.length < 10) {
    return jsonResponse({ error: 'Password must be at least 10 characters' }, 400);
  }

  const { data: targetRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!targetRow) {
    return jsonResponse({ error: 'Target user is not a backend user' }, 404);
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  if (error) return jsonResponse({ error: error.message }, 400);

  return jsonResponse({ ok: true });
}

async function handleDelete(
  supabase: SupabaseClient,
  id: string | null,
  callerUserId: string
): Promise<Response> {
  if (!id) return jsonResponse({ error: 'id is required' }, 400);

  const { data: admin, error: getErr } = await supabase
    .from('admin_users')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (getErr) return jsonResponse({ error: getErr.message }, 400);
  if (!admin) return jsonResponse({ error: 'Admin user not found' }, 404);
  if (admin.user_id === callerUserId) {
    return jsonResponse({ error: 'You cannot remove your own account' }, 400);
  }

  const { error: delDbErr } = await supabase.from('admin_users').delete().eq('id', id);
  if (delDbErr) return jsonResponse({ error: delDbErr.message }, 400);

  if (admin.user_id) {
    const { error: delAuthErr } = await supabase.auth.admin.deleteUser(admin.user_id);
    if (delAuthErr) console.warn('[admin-users] auth delete failed:', delAuthErr.message);
  }

  return jsonResponse({ ok: true });
}
