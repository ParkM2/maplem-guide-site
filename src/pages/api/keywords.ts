import type { APIRoute } from 'astro';
import { guard, json } from '../../lib/server/auth';
import { KEYWORDS_FILE, readFile, commit } from '../../lib/server/github';

export const prerender = false;

const MAX = 10;

// 기본 키워드: 새 글을 열면 자동으로 들어가는 키워드 목록
export const GET: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  try {
    const data = JSON.parse(await readFile(KEYWORDS_FILE));
    return json({ defaults: Array.isArray(data.defaults) ? data.defaults : [] });
  } catch {
    return json({ defaults: [] });
  }
};

export const POST: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  const input = await ctx.request.json().catch(() => null);
  if (!input || !Array.isArray(input.defaults)) return json({ error: '보낸 내용을 읽을 수 없어요.' }, 400);
  const defaults = [...new Set(input.defaults.map((t: unknown) => String(t).replace(/^#+/, '').trim().slice(0, 20)).filter(Boolean))] as string[];
  if (defaults.length > MAX) return json({ error: `키워드는 ${MAX}개까지 넣을 수 있어요.` }, 400);
  try {
    await commit('기본 키워드 변경', [{ path: KEYWORDS_FILE, text: JSON.stringify({ defaults }, null, 2) + '\n' }]);
    return json({ ok: true, defaults });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
