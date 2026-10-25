import type { APIRoute } from 'astro';
import { json } from '../../../lib/server/auth';
import { boardReady, checkPw, ensureBoard, getPost, grantAccess } from '../../../lib/server/board';

export const prerender = false;

// 비밀글 열기: 글을 쓸 때 넣은 비밀번호가 맞으면 하루 동안 볼 수 있습니다.
export const POST: APIRoute = async (ctx) => {
  if (!boardReady()) return json({ error: '게시판 저장소가 아직 연결되지 않았어요.' }, 503);
  const b = await ctx.request.json().catch(() => ({}));
  await ensureBoard();
  const post = await getPost(Number(b.id));
  if (!post) return json({ error: '없는 글이에요.' }, 404);
  if (!checkPw(String(b.pw ?? ''), post.pw)) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
  grantAccess(ctx, post.id);
  return json({ ok: true });
};
