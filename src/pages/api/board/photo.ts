import type { APIRoute } from 'astro';
import { checkToken, json } from '../../../lib/server/auth';
import { sql } from '../../../lib/server/db';
import { LIMITS, boardReady, ensureBoard, sniffImage } from '../../../lib/server/board';

export const prerender = false;

// 글에 사진 한 장 올리기 (글을 쓴 직후 10분 동안만)
export const POST: APIRoute = async (ctx) => {
  if (!boardReady()) return json({ error: '게시판 저장소가 아직 연결되지 않았어요.' }, 503);
  const q = ctx.url.searchParams;
  const id = Number(q.get('post'));
  if (!Number.isInteger(id) || !checkToken(q.get('t') ?? '', `up${id}`)) return json({ error: '사진을 올릴 수 있는 시간이 지났어요.' }, 403);
  const buf = new Uint8Array(await ctx.request.arrayBuffer());
  if (buf.length > LIMITS.imageBytes) return json({ error: '사진이 너무 커요.' }, 413);
  const mime = sniffImage(buf);
  if (!mime) return json({ error: '사진 파일(JPG, PNG, GIF, WEBP)만 올릴 수 있어요.' }, 415);
  const dim = (k: string) => {
    const n = Math.round(Number(q.get(k)));
    return n > 0 && n < 20000 ? n : null;
  };
  try {
    await ensureBoard();
    const db = sql();
    const [row] = await db`
      with p as (update board_posts set images = images + 1 where id = ${id} and images < ${LIMITS.images} returning images)
      insert into board_images (post_id, ord, mime, width, height, data)
      select ${id}, p.images, ${mime}, ${dim('w')}, ${dim('h')}, ${Buffer.from(buf)} from p
      returning id`;
    if (!row) return json({ error: `사진은 ${LIMITS.images}장까지 올릴 수 있어요.` }, 400);
    return json({ ok: true, id: row.id });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
