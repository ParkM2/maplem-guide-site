import type { APIRoute } from 'astro';
import { guard, json } from '../../lib/server/auth';
import { CATEGORIES_DIR, readDir, commit } from '../../lib/server/github';
import { writeDoc } from '../../lib/server/frontmatter';

export const prerender = false;

const SLUG = /^[a-z0-9-]+$/;

// 분류 전체를 받아서 추가, 수정, 삭제를 한 번에 저장합니다. 목록 순서가 메뉴 순서가 됩니다.
export const POST: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  const { categories } = await ctx.request.json().catch(() => ({}));
  if (!Array.isArray(categories) || categories.length === 0) return json({ error: '분류가 하나 이상 있어야 해요.' }, 400);
  const seen = new Set<string>();
  for (const c of categories) {
    if (!String(c.name ?? '').trim()) return json({ error: '분류 이름을 적어 주세요.' }, 400);
    if (!SLUG.test(String(c.slug ?? ''))) return json({ error: `"${c.name}" 주소는 영문 소문자, 숫자, 하이픈(-)만 쓸 수 있어요.` }, 400);
    if (seen.has(c.slug)) return json({ error: `주소 "${c.slug}"가 겹쳐요.` }, 400);
    seen.add(c.slug);
  }
  try {
    const existing = await readDir(CATEGORIES_DIR);
    const changes: Parameters<typeof commit>[1] = categories.map((c: any, i: number) => ({
      path: `${CATEGORIES_DIR}/${c.slug}.md`,
      text: writeDoc({ name: String(c.name).trim(), slug: c.slug, order: (i + 1) * 10, description: String(c.description ?? '').trim() }),
    }));
    for (const e of existing) {
      if (!seen.has(e.name.replace(/\.md$/, ''))) changes.push({ path: e.path, delete: true });
    }
    await commit('분류 수정', changes);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
