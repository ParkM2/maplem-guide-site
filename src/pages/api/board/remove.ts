import type { APIRoute } from 'astro';
import { json } from '../../../lib/server/auth';
import { sql } from '../../../lib/server/db';
import { boardReady, checkPw, ensureBoard, isAdmin } from '../../../lib/server/board';

export const prerender = false;

// 글 또는 댓글 지우기: 쓸 때 넣은 비밀번호, 또는 관리자
export const POST: APIRoute = async (ctx) => {
  if (!boardReady()) return json({ error: '게시판 저장소가 아직 연결되지 않았어요.' }, 503);
  const b = await ctx.request.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: '없는 글이에요.' }, 404);
  await ensureBoard();
  const db = sql();
  const admin = isAdmin(ctx);
  const pw = String(b.pw ?? '');
  if (b.kind === 'comment') {
    const [c] = await db`select id, post_id, pw from board_comments where id = ${id}`;
    if (!c) return json({ error: '없는 댓글이에요.' }, 404);
    if (!admin && !checkPw(pw, c.pw)) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    await db`delete from board_comments where id = ${id}`;
    await db`update board_posts set comments = greatest(comments - 1, 0) where id = ${c.post_id}`;
    return json({ ok: true });
  }
  const [p] = await db`select id, pw from board_posts where id = ${id}`;
  if (!p) return json({ error: '없는 글이에요.' }, 404);
  if (!admin && !checkPw(pw, p.pw)) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
  await db`delete from board_posts where id = ${id}`;
  return json({ ok: true });
};
