import type { APIRoute } from 'astro';
import { guard, json } from '../../lib/server/auth';
import { ABOUT_FILE, MEDIA_DIR, readFile, commit } from '../../lib/server/github';
import { parseDoc, writeDoc } from '../../lib/server/frontmatter';

export const prerender = false;

const MEDIA = /^[a-z0-9-]+\.(webp|png|jpe?g|gif)$/;

// 사이트 소개 불러오기
export const GET: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  try {
    const { data, body } = parseDoc(await readFile(ABOUT_FILE));
    return json({ data, body });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};

// 사이트 소개 저장. 사진은 /api/upload 로 먼저 올린 blob을 함께 커밋합니다.
export const POST: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  const input = await ctx.request.json().catch(() => null);
  if (!input) return json({ error: '보낸 내용을 읽을 수 없어요.' }, 400);
  const title = String(input.title ?? '').trim();
  if (!title) return json({ error: '제목을 적어 주세요.' }, 400);
  const images: { path: string; blobSha: string }[] = [];
  for (const img of input.images ?? []) {
    if (!MEDIA.test(String(img.name)) || !/^[0-9a-f]{40}$/.test(String(img.sha))) return json({ error: '사진 정보가 잘못됐어요.' }, 400);
    images.push({ path: `${MEDIA_DIR}/${img.name}`, blobSha: img.sha });
  }
  try {
    await commit('사이트 소개 수정', [{ path: ABOUT_FILE, text: writeDoc({ title }, String(input.body ?? '')) }, ...images]);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
