import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/server/db';
import { boardReady, canRead, ensureBoard, photoKey } from '../../../../lib/server/board';

export const prerender = false;

// 게시판 사진 보기. 비밀글의 사진은 글을 볼 수 있는 사람에게만 보여 줍니다.
export const GET: APIRoute = async (ctx) => {
  const id = Number(ctx.params.id);
  if (!boardReady() || !Number.isInteger(id) || id <= 0) return new Response('없는 사진이에요.', { status: 404 });
  await ensureBoard();
  const [img] = await sql()`
    select i.mime, i.data, p.id as post_id, p.secret
    from board_images i join board_posts p on p.id = i.post_id where i.id = ${id}`;
  if (!img) return new Response('없는 사진이에요.', { status: 404 });
  if (!canRead(ctx, { id: img.post_id, secret: img.secret })) return new Response('비밀글의 사진이에요.', { status: 403 });
  return new Response(img.data, {
    headers: {
      'content-type': img.mime,
      // 서명된 공개글 사진 주소는 CDN에 30일 저장, 그 밖의 공개 사진은 브라우저에만 하루 저장
      'cache-control': img.secret
        ? 'private, max-age=3600'
        : ctx.url.searchParams.get('k') === photoKey(id)
          ? 'public, max-age=86400, s-maxage=2592000'
          : 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
    },
  });
};
