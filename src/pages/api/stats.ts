import type { APIRoute } from 'astro';
import { guard, json } from '../../lib/server/auth';
import { dbConfigured, ensureSchema, sql } from '../../lib/server/db';
import { getCategories, getPosts, postUrl, url } from '../../lib/site';

export const prerender = false;

const DAY = 86400e3;
const KST = 9 * 3600e3;

// 기간: today, yesterday, 7, 30, 90 (한국 시간 기준)
function range(r: string) {
  const now = Date.now();
  const today = Math.floor((now + KST) / DAY) * DAY - KST;
  let start = today, end = now, days = 1;
  if (r === 'yesterday') (start = today - DAY), (end = today);
  else if (['7', '30', '90'].includes(r)) (days = Number(r)), (start = today - (days - 1) * DAY);
  const unit = days === 1 ? 'hour' : 'day';
  return { start: new Date(start), end: new Date(end), prevStart: new Date(start - days * DAY), prevEnd: new Date(end - days * DAY), unit, days };
}

async function titles() {
  const map: Record<string, string> = { '/': '첫 화면', '/about/': '사이트 소개' };
  for (const c of await getCategories()) map[url(`/${c.slug}/`)] = `${c.name} 목록`;
  for (const p of await getPosts()) map[postUrl(p)] = p.data.title;
  return map;
}

export const GET: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  if (!dbConfigured()) return json({ configured: false });
  const R = range(ctx.url.searchParams.get('range') ?? '7');
  try {
    await ensureSchema();
    const db = sql();
    const inRange = (s: Date, e: Date) => db`ts >= ${s} and ts < ${e}`;
    const cur = inRange(R.start, R.end);

    const summary = (s: Date, e: Date) => db`
      with v as (select * from visits where ${inRange(s, e)}),
      s as (select sid, count(*) c, sum(dur) filter (where dur between 1 and 3600) d from v group by sid)
      select
        (select count(*) from v)::int as pv,
        (select count(distinct vid) from v)::int as uv,
        (select count(*) from s)::int as visits,
        (select count(distinct vid) from v where new_visitor)::int as new_uv,
        (select count(*) from s where c = 1)::int as bounced,
        (select round(avg(d)) from s where d is not null)::int as avg_visit_dur,
        (select round(avg(dur)) from v where dur between 1 and 3600)::int as avg_page_dur`;

    const group = (col: string, where = db``, limit = 12) => db`
      select coalesce(${db(col)}::text, '알 수 없음') as name, count(*)::int as n
      from visits where ${cur} ${where}
      group by 1 order by 2 desc limit ${limit}`;
    const groupVisits = (col: string) => db`
      select name, count(*)::int as n from (
        select distinct on (sid) sid, coalesce(${db(col)}::text, '알 수 없음') as name from visits where ${cur} order by sid, ts
      ) x group by 1 order by 2 desc limit 12`;

    const [[now], [cur1], [prev], series, hours, weekdays, sources, refs, keywords, devices, browsers, oses, countries, pages, entries] =
      await Promise.all([
        db`select
             (select count(distinct sid) from visits where ts > now() - interval '5 minutes')::int as online,
             (select count(*) from visits where ts >= ${new Date(Math.floor((Date.now() + KST) / DAY) * DAY - KST)})::int as today_pv`,
        summary(R.start, R.end),
        summary(R.prevStart, R.prevEnd),
        db`select to_char(date_trunc(${R.unit}, ts at time zone 'Asia/Seoul'), ${R.unit === 'hour' ? 'HH24' : 'YYYY-MM-DD'}) as k,
             count(*)::int as pv, count(distinct vid)::int as uv, count(distinct sid)::int as visits
           from visits where ${cur} group by 1 order by 1`,
        db`select extract(hour from ts at time zone 'Asia/Seoul')::int as k, count(*)::int as n from visits where ${cur} group by 1`,
        db`select extract(dow from ts at time zone 'Asia/Seoul')::int as k, count(*)::int as n from visits where ${cur} group by 1`,
        group('source', db`and new_session`),
        group('ref_host', db`and new_session and ref_host is not null`, 15),
        group('keyword', db`and keyword is not null`, 20),
        groupVisits('device'),
        groupVisits('browser'),
        groupVisits('os'),
        groupVisits('country'),
        db`select path, count(*)::int as pv, count(distinct vid)::int as uv,
             round(avg(dur) filter (where dur between 1 and 3600))::int as dur
           from visits where ${cur} group by path order by pv desc limit 20`,
        db`select path as name, count(*)::int as n from visits where ${cur} and new_session group by 1 order by 2 desc limit 10`,
      ]);

    const t = await titles();
    const title = (p: string) => t[p] ?? t[p.endsWith('/') ? p : p + '/'] ?? p;
    const catNames = Object.fromEntries((await getCategories()).map((c) => [c.slug, c.name]));
    const byCat: Record<string, number> = {};
    for (const p of await db`select split_part(path, '/', 2) as c, count(*)::int as n from visits where ${cur} group by 1`) {
      const name = p.c === '' ? '첫 화면' : catNames[p.c] ?? '기타';
      byCat[name] = (byCat[name] ?? 0) + p.n;
    }

    return json({
      configured: true,
      range: { start: R.start, end: R.end, unit: R.unit, days: R.days },
      now,
      summary: cur1,
      prev,
      series,
      hours,
      weekdays,
      sources,
      refs,
      keywords,
      devices,
      browsers,
      oses,
      countries,
      pages: pages.map((p) => ({ ...p, title: title(p.path) })),
      entries: entries.map((p) => ({ name: title(p.name), n: p.n })),
      categories: Object.entries(byCat).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    });
  } catch (err) {
    console.error('stats', err);
    return json({ error: `통계를 불러오지 못했어요: ${(err as Error).message}` }, 500);
  }
};
