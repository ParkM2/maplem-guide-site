import type { APIRoute } from 'astro';
import { guard, json } from '../../lib/server/auth';
import { POSTS_DIR, CATEGORIES_DIR, MEDIA_DIR, readDir, readFile, commit } from '../../lib/server/github';
import { parseDoc, writeDoc } from '../../lib/server/frontmatter';

export const prerender = false;

const SLUG = /^[a-z0-9-]+$/;
const FILE = /^[a-z0-9-]+\.md$/;
const MEDIA = /^[a-z0-9-]+\.(webp|png|jpe?g|gif)$/;
const MAX_DRAFTS = 20;
const MAX_TAGS = 10;

// 글 목록, 또는 ?file=이름.md 로 글 하나
export const GET: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  try {
    const file = ctx.url.searchParams.get('file');
    if (file) {
      if (!FILE.test(file)) return json({ error: '잘못된 파일 이름이에요.' }, 400);
      const { data, body } = parseDoc(await readFile(`${POSTS_DIR}/${file}`));
      return json({ file, data, body });
    }
    const [posts, cats] = await Promise.all([readDir(POSTS_DIR), readDir(CATEGORIES_DIR)]);
    return json({
      posts: posts.map((p) => ({ file: p.name, data: parseDoc(p.text).data })),
      categories: cats.map((c) => ({ file: c.name, ...parseDoc(c.text).data })),
    });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};

// 글 저장 (새 글 또는 수정). 사진은 /api/upload 로 먼저 올린 blob을 함께 커밋합니다.
export const POST: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  const input = await ctx.request.json().catch(() => null);
  if (!input) return json({ error: '보낸 내용을 읽을 수 없어요.' }, 400);
  const d = input.data ?? {};
  const slug = String(d.slug ?? '').trim();
  const draft = Boolean(d.draft);
  if (!String(d.title ?? '').trim() && draft) d.title = '(제목 없음)';
  if (!String(d.title ?? '').trim()) return json({ error: '제목을 적어 주세요.' }, 400);
  if (Array.isArray(d.tags) && d.tags.length > MAX_TAGS) return json({ error: `키워드는 ${MAX_TAGS}개까지 넣을 수 있어요.` }, 400);
  if (!SLUG.test(slug)) return json({ error: '주소는 영문 소문자, 숫자, 하이픈(-)만 쓸 수 있어요.' }, 400);
  if (!SLUG.test(String(d.category ?? ''))) return json({ error: '분류를 골라 주세요.' }, 400);
  const original = input.originalFile ? String(input.originalFile) : null;
  if (original && !FILE.test(original)) return json({ error: '잘못된 파일 이름이에요.' }, 400);
  const images: { path: string; blobSha: string }[] = [];
  for (const img of input.images ?? []) {
    if (!MEDIA.test(String(img.name)) || !/^[0-9a-f]{40}$/.test(String(img.sha))) return json({ error: '사진 정보가 잘못됐어요.' }, 400);
    images.push({ path: `${MEDIA_DIR}/${img.name}`, blobSha: img.sha });
  }

  const file = `${slug}.md`;
  try {
    const existing = await readDir(POSTS_DIR);
    if (file !== original && existing.some((p) => p.name === file)) return json({ error: '같은 주소의 글이 이미 있어요. 주소를 바꿔 주세요.' }, 409);
    // 임시 저장 글은 최대 20개
    const otherDrafts = existing.filter((p) => p.name !== original && p.name !== file && parseDoc(p.text).data.draft).length;
    if (draft && otherDrafts >= MAX_DRAFTS)
      return json({ error: `임시 저장 글은 ${MAX_DRAFTS}개까지예요. 필요 없는 임시 저장 글을 지우거나 발행해 주세요.` }, 409);
    const doc = writeDoc(
      {
        title: String(d.title).trim(),
        slug,
        category: d.category,
        summary: String(d.summary ?? '').trim(),
        patch: String(d.patch ?? '').trim(),
        updated: String(d.updated || new Date().toISOString().slice(0, 10)),
        tags: Array.isArray(d.tags) && d.tags.length ? d.tags.map((t: unknown) => String(t).trim().slice(0, 20)).filter(Boolean) : undefined,
        order: Number.isFinite(Number(d.order)) ? Number(d.order) : 100,
        draft,
        savedAt: draft ? new Date().toISOString() : undefined,
      },
      String(input.body ?? ''),
    );
    const changes: Parameters<typeof commit>[1] = [{ path: `${POSTS_DIR}/${file}`, text: doc }, ...images];
    if (original && original !== file) changes.push({ path: `${POSTS_DIR}/${original}`, delete: true });
    await commit(`${draft ? '임시 저장' : `글 ${original ? '수정' : '추가'}`}: ${String(d.title).trim()}`, changes);
    return json({ ok: true, file, drafts: otherDrafts + (draft ? 1 : 0), maxDrafts: MAX_DRAFTS });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};

export const DELETE: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  const file = ctx.url.searchParams.get('file') ?? '';
  if (!FILE.test(file)) return json({ error: '잘못된 파일 이름이에요.' }, 400);
  try {
    await commit(`글 삭제: ${file}`, [{ path: `${POSTS_DIR}/${file}`, delete: true }]);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
