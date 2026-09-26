import type { APIRoute } from 'astro';
import { guard, json } from '../../lib/server/auth';
import { createBlob } from '../../lib/server/github';

export const prerender = false;

// 사진 한 장을 GitHub에 올려 두고 blob 번호를 돌려줍니다. 커밋은 글을 저장할 때 합니다.
export const POST: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  const { data = '' } = await ctx.request.json().catch(() => ({}));
  const m = String(data).match(/^data:image\/(webp|png|jpeg|gif);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return json({ error: '사진 형식이 잘못됐어요.' }, 400);
  if (m[2].length > 4_000_000) return json({ error: '사진이 너무 커요.' }, 413);
  try {
    const sha = await createBlob(m[2]);
    return json({ sha, ext: m[1] === 'jpeg' ? 'jpg' : m[1] });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
