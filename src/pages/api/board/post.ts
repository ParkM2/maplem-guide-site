import type { APIRoute } from 'astro';
import { json } from '../../../lib/server/auth';
import { sql } from '../../../lib/server/db';
import { boardReady, canEdit, ensureBoard, getPost } from '../../../lib/server/board';

export const prerender = false;

// 수정 화면에 채울 글 내용
export const GET: APIRoute = async (ctx) => {
  if (!boardReady()) return json({ error: '게시판 저장소가 아직 연결되지 않았어요.' }, 503);
  await ensureBoard();
  const post = await getPost(Number(ctx.url.searchParams.get('id')));
  if (!post) return json({ error: '없는 글이에요.' }, 404);
  if (!canEdit(ctx, post)) return json({ error: '수정할 수 있는 시간이 지났어요. 글에서 수정 버튼을 다시 눌러 주세요.' }, 403);
  const images = await sql()`select id, width, height from board_images where post_id = ${post.id} order by ord, id`;
  return json({ id: post.id, name: post.name, title: post.title, body: post.body, secret: post.secret, notice: post.notice, images });
};
