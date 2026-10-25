import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { json, signedToken } from '../../../lib/server/auth';
import { sql } from '../../../lib/server/db';
import { LIMITS, boardReady, clean, ensureBoard, grantAccess, hashPw, ipKey, isAdmin } from '../../../lib/server/board';

export const prerender = false;

const RESERVED = /관리자|운영자|admin/i;

// 새 글 쓰기. 사진은 글을 만든 뒤 받은 표(t)로 한 장씩 올립니다.
export const POST: APIRoute = async (ctx) => {
  if (!boardReady()) return json({ error: '게시판 저장소가 아직 연결되지 않았어요.' }, 503);
  const b = await ctx.request.json().catch(() => ({}));
  if (b.website) return json({ error: '저장하지 못했어요.' }, 400); // 자동 등록 프로그램 거르기
  const name = clean(b.name, LIMITS.name).replace(/\s+/g, ' ');
  const pw = String(b.pw ?? '');
  const title = clean(b.title, LIMITS.title).replace(/\s+/g, ' ');
  const body = clean(b.body, LIMITS.body);
  const admin = isAdmin(ctx);
  // 공지: admin 페이지에서 관리자만. 맨 위에 굵게 고정되고 사진 개수·크기 제한이 없습니다.
  const notice = admin && Boolean(b.notice);
  if (notice) {
    if (!title) return json({ error: '제목을 입력해 주세요.' }, 400);
    if (!body) return json({ error: '내용을 입력해 주세요.' }, 400);
    try {
      await ensureBoard();
      const [row] = await sql()`
        insert into board_posts (name, pw, secret, notice, title, body, ip)
        values ('관리자', ${hashPw(randomBytes(24).toString('base64'))}, false, true, ${title}, ${body}, ${ipKey(ctx)})
        returning id`;
      return json({ id: row.id, t: signedToken(`up${row.id}`, 60 * 60) });
    } catch (e) {
      return json({ error: String((e as Error).message) }, 502);
    }
  }
  if (!name) return json({ error: '작성자명을 입력해 주세요.' }, 400);
  if (!admin && RESERVED.test(name)) return json({ error: '이 작성자명은 쓸 수 없어요.' }, 400);
  if (pw.length < LIMITS.pwMin || pw.length > LIMITS.pwMax) return json({ error: `비밀번호는 ${LIMITS.pwMin}~${LIMITS.pwMax}자로 입력해 주세요.` }, 400);
  if (!title) return json({ error: '제목을 입력해 주세요.' }, 400);
  if (!body) return json({ error: '내용을 입력해 주세요.' }, 400);
  try {
    await ensureBoard();
    const db = sql();
    const ip = ipKey(ctx);
    if (!admin) {
      const [{ n }] = await db`select count(*)::int as n from board_posts where ip = ${ip} and created > now() - interval '10 minutes'`;
      if (n >= 5) return json({ error: '글을 너무 자주 쓰고 있어요. 잠시 뒤에 다시 써 주세요.' }, 429);
    }
    const [row] = await db`
      insert into board_posts (name, pw, secret, title, body, ip)
      values (${name}, ${hashPw(pw)}, ${Boolean(b.secret)}, ${title}, ${body}, ${ip})
      returning id`;
    grantAccess(ctx, row.id); // 쓴 사람은 비밀글도 바로 볼 수 있게
    return json({ id: row.id, t: signedToken(`up${row.id}`, 10 * 60) });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
