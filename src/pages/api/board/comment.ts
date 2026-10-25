import type { APIRoute } from 'astro';
import { json } from '../../../lib/server/auth';
import { sql } from '../../../lib/server/db';
import { LIMITS, boardReady, canRead, clean, ensureBoard, getPost, hashPw, ipKey, isAdmin } from '../../../lib/server/board';

export const prerender = false;

const RESERVED = /관리자|운영자|admin/i;

// 댓글 쓰기 (질문/의견 게시판 글에만). 관리자는 이름과 비밀번호 없이 "관리자"로 씁니다.
export const POST: APIRoute = async (ctx) => {
  if (!boardReady()) return json({ error: '게시판 저장소가 아직 연결되지 않았어요.' }, 503);
  const b = await ctx.request.json().catch(() => ({}));
  if (b.website) return json({ error: '저장하지 못했어요.' }, 400);
  await ensureBoard();
  const post = await getPost(Number(b.post));
  if (!post) return json({ error: '없는 글이에요.' }, 404);
  if (!canRead(ctx, post)) return json({ error: '비밀글은 글을 연 사람만 댓글을 쓸 수 있어요.' }, 403);
  const admin = isAdmin(ctx);
  const body = clean(b.body, LIMITS.comment);
  if (!body) return json({ error: '댓글 내용을 입력해 주세요.' }, 400);
  let name = '관리자';
  let pw: string | null = null;
  if (!admin) {
    name = clean(b.name, LIMITS.name).replace(/\s+/g, ' ');
    const raw = String(b.pw ?? '');
    if (!name) return json({ error: '작성자명을 입력해 주세요.' }, 400);
    if (RESERVED.test(name)) return json({ error: '이 작성자명은 쓸 수 없어요.' }, 400);
    if (raw.length < LIMITS.pwMin || raw.length > LIMITS.pwMax) return json({ error: `비밀번호는 ${LIMITS.pwMin}~${LIMITS.pwMax}자로 입력해 주세요.` }, 400);
    pw = hashPw(raw);
  }
  try {
    const db = sql();
    const ip = ipKey(ctx);
    if (!admin) {
      const [{ n }] = await db`select count(*)::int as n from board_comments where ip = ${ip} and created > now() - interval '10 minutes'`;
      if (n >= 10) return json({ error: '댓글을 너무 자주 쓰고 있어요. 잠시 뒤에 다시 써 주세요.' }, 429);
    }
    await db`insert into board_comments (post_id, name, pw, admin, body, ip) values (${post.id}, ${name}, ${pw}, ${admin}, ${body}, ${ip})`;
    await db`update board_posts set comments = comments + 1 where id = ${post.id}`;
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
