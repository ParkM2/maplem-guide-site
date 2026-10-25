import type { APIRoute } from 'astro';
import { json } from '../../../lib/server/auth';
import { boardReady, checkPw, ensureBoard, getPost, grantAccess, grantEdit, isAdmin } from '../../../lib/server/board';

export const prerender = false;

// 글 수정 시작: 글을 쓸 때 넣은 비밀번호 확인 (관리자는 확인 없이)
export const POST: APIRoute = async (ctx) => {
  if (!boardReady()) return json({ error: '게시판 저장소가 아직 연결되지 않았어요.' }, 503);
  const b = await ctx.request.json().catch(() => ({}));
  await ensureBoard();
  const post = await getPost(Number(b.id));
  if (!post) return json({ error: '없는 글이에요.' }, 404);
  if (!isAdmin(ctx)) {
    if (post.notice) return json({ error: '공지는 관리자만 고칠 수 있어요.' }, 403);
    if (!checkPw(String(b.pw ?? ''), post.pw)) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    grantAccess(ctx, post.id);
  }
  grantEdit(ctx, post.id);
  return json({ ok: true });
};
