import type { APIRoute } from 'astro';
import { guard, json } from '../../../lib/server/auth';
import { dbConfigured, sql } from '../../../lib/server/db';
import { ensureBoard } from '../../../lib/server/board';

export const prerender = false;

// admin용 게시판 글 목록 (비밀글 제목도 그대로)
export const GET: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  if (!dbConfigured()) return json({ configured: false });
  try {
    await ensureBoard();
    const posts = await sql()`
      select p.id, p.created, p.name, p.secret, p.title, p.images, p.comments, p.views,
             exists (select 1 from board_comments c where c.post_id = p.id and c.admin) as answered
      from board_posts p order by p.id desc limit 300`;
    return json({ configured: true, posts });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
