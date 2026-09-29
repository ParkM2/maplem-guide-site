import type { APIRoute } from 'astro';
import { guard, json } from '../../lib/server/auth';
import { dbConfigured, ensureSchema, sql } from '../../lib/server/db';

export const prerender = false;

const KST = 9 * 3600e3;
const DAY = 86400e3;

// 글별 조회수 (admin 글 목록용). 글 주소의 마지막 부분(slug)으로 모읍니다.
// 분류를 옮겨 주소가 바뀐 글도 예전 조회수가 함께 합쳐집니다.
export const GET: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  if (!dbConfigured()) return json({ configured: false });
  try {
    await ensureSchema();
    const today = new Date(Math.floor((Date.now() + KST) / DAY) * DAY - KST);
    const rows = await sql()`
      select substring(path from '^/[^/]+/([^/]+)/?$') as slug,
             count(*)::int as total,
             (count(*) filter (where ts >= ${today}))::int as today
      from visits
      where path ~ '^/[^/]+/[^/]+/?$'
      group by 1`;
    const views: Record<string, { total: number; today: number }> = {};
    for (const r of rows) if (r.slug) views[r.slug] = { total: r.total, today: r.today };
    return json({ configured: true, views });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
