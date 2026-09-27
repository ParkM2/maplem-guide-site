import type { APIRoute } from 'astro';
import { isLoggedIn } from '../../lib/server/auth';
import { dbConfigured, ensureSchema, sql } from '../../lib/server/db';
import { browser, classifyReferrer, device, isBot, os } from '../../lib/server/visit';

export const prerender = false;

const ok = () => new Response(null, { status: 204 });
const id = (v: unknown) => (typeof v === 'string' && /^[a-z0-9]{8,40}$/i.test(v) ? v : null);

// 방문 기록: 페이지를 열 때 한 번, 떠날 때 머문 시간을 한 번 보냅니다.
export const POST: APIRoute = async (ctx) => {
  if (!dbConfigured()) return ok();
  const ua = ctx.request.headers.get('user-agent') ?? '';
  // 봇과 관리자(로그인한 사람) 방문은 세지 않습니다.
  if (isBot(ua) || isLoggedIn(ctx)) return ok();
  let b: any;
  try {
    b = JSON.parse(await ctx.request.text());
  } catch {
    return ok();
  }
  try {
    await ensureSchema();
    const db = sql();
    if (b.t === 'dur') {
      const pid = id(b.pid);
      const dur = Math.round(Number(b.dur));
      if (pid && dur > 0 && dur < 6 * 3600) {
        await db`update visits set dur = ${dur} where pid = ${pid} and ts > now() - interval '12 hours'`;
      }
      return ok();
    }
    const pid = id(b.pid), vid = id(b.vid), sid = id(b.sid);
    const path = typeof b.path === 'string' ? b.path.slice(0, 300) : '';
    if (!pid || !vid || !sid || !path.startsWith('/') || path.startsWith('/admin') || path.startsWith('/api')) return ok();
    const ref = typeof b.ref === 'string' ? b.ref.slice(0, 500) : '';
    const utm = typeof b.utm === 'string' && b.utm ? b.utm : null;
    const { source, refHost, keyword } = classifyReferrer(ref, ctx.url.hostname, utm);
    const newSession = Boolean(b.ns);
    await db`
      insert into visits (pid, path, vid, sid, new_visitor, new_session, source, ref_host, keyword, device, browser, os, country)
      values (${pid}, ${path}, ${vid}, ${sid}, ${Boolean(b.nv)}, ${newSession},
        ${newSession || source !== '내부 이동' ? source : null}, ${refHost}, ${keyword},
        ${device(ua)}, ${browser(ua)}, ${os(ua)}, ${ctx.request.headers.get('x-vercel-ip-country')})`;
    // 가끔 400일 지난 기록을 지웁니다.
    if (Math.random() < 0.005) await db`delete from visits where ts < now() - interval '400 days'`;
  } catch (err) {
    console.error('seen', err);
  }
  return ok();
};
