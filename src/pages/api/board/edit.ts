import type { APIRoute } from 'astro';
import { json, signedToken } from '../../../lib/server/auth';
import { sql } from '../../../lib/server/db';
import { LIMITS, boardReady, canEdit, clean, ensureBoard, getPost } from '../../../lib/server/board';

export const prerender = false;

// 글 수정 저장. 뺀 사진은 지우고, 새 사진은 받은 표(t)로 이어서 올립니다.
export const POST: APIRoute = async (ctx) => {
  if (!boardReady()) return json({ error: '게시판 저장소가 아직 연결되지 않았어요.' }, 503);
  const b = await ctx.request.json().catch(() => ({}));
  await ensureBoard();
  const post = await getPost(Number(b.id));
  if (!post) return json({ error: '없는 글이에요.' }, 404);
  if (!canEdit(ctx, post)) return json({ error: '수정할 수 있는 시간이 지났어요. 글에서 수정 버튼을 다시 눌러 주세요.' }, 403);
  const title = clean(b.title, LIMITS.title).replace(/\s+/g, ' ');
  const body = clean(b.body, LIMITS.body);
  if (!title) return json({ error: '제목을 입력해 주세요.' }, 400);
  if (!body) return json({ error: '내용을 입력해 주세요.' }, 400);
  const remove = (Array.isArray(b.remove) ? b.remove : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
  const adding = Math.max(0, Math.floor(Number(b.adding) || 0));
  const secret = post.notice ? false : Boolean(b.secret);
  try {
    const db = sql();
    const [{ n }] = await db`select count(*)::int as n from board_images where post_id = ${post.id} and not (id = any(${remove}::int[]))`;
    const max = post.notice ? LIMITS.noticeImages : LIMITS.images;
    if (n + adding > max) return json({ error: `사진은 ${max}장까지 올릴 수 있어요.` }, 400);
    if (remove.length) await db`delete from board_images where post_id = ${post.id} and id = any(${remove}::int[])`;
    await db`update board_posts set title = ${title}, body = ${body}, secret = ${secret}, images = ${n}, updated = now() where id = ${post.id}`;
    return json({ ok: true, id: post.id, t: signedToken(`up${post.id}`, post.notice ? 60 * 60 : 10 * 60) });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
