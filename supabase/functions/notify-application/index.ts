// supabase/functions/notify-application/index.ts
// Emails the team when a new join application arrives.
// Wire it up as a Database Webhook: Dashboard → Database → Webhooks →
//   table: join_applications, event: INSERT, type: Supabase Edge Function → notify-application
// Secrets required (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY  — from https://resend.com (free tier is fine)
//   NOTIFY_EMAIL    — where to send notifications, e.g. info@taiwanteentrust.org

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

Deno.serve(async (req: Request) => {
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const to = Deno.env.get('NOTIFY_EMAIL');
    if (!apiKey || !to) {
      console.error('[notify-application] missing RESEND_API_KEY or NOTIFY_EMAIL');
      return new Response('misconfigured', { status: 500 });
    }

    const payload = await req.json(); // Supabase webhook body: { type, table, record, ... }
    const r = payload.record;
    if (!r) return new Response('no record', { status: 400 });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TTT Website <onboarding@resend.dev>', // replace once taiwanteentrust.org is verified in Resend
        to: [to],
        subject: `新的入社申請：${r.name_zh || r.name_en || '(未填姓名)'}`,
        html: `
          <h2>新的入社申請</h2>
          <p><b>姓名：</b>${esc(r.name_zh)} / ${esc(r.name_en)}</p>
          <p><b>Email：</b>${esc(r.email)}</p>
          <p><b>學校：</b>${esc(r.school)}（${esc(r.graduation_year)} 畢業）</p>
          <p><b>加入動機：</b><br>${esc(r.reason_join)}</p>
          <p><b>期望收穫：</b><br>${esc(r.expected_gains)}</p>
          <p><a href="https://taiwanteentrust.org/admin/applications.html">→ 前往後台審閱</a></p>`,
      }),
    });

    if (!res.ok) console.error('[notify-application] resend error', res.status, await res.text());
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[notify-application]', e);
    return new Response('error', { status: 500 });
  }
});
