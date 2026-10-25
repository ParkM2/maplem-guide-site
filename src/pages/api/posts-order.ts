import type { APIRoute } from 'astro';
import { guard, json } from '../../lib/server/auth';
import { POSTS_DIR, readDir, commit } from '../../lib/server/github';
import { parseDoc, writeDoc } from '../../lib/server/frontmatter';

export const prerender = false;

const SLUG = /^[a-z0-9-]+$/;
const FILE = /^[a-z0-9-]+\.md$/;
// 순서를 정한 글은 101, 102, … 로 매깁니다.
// 새 글의 기본값(100)이 이보다 작아서, 새로 쓴 글은 분류 맨 위에 나타납니다.
const START = 101;

// 한 분류 안의 글 순서 저장 (admin 글 목록에서 끌어서 바꾼 순서)
export const POST: APIRoute = async (ctx) => {
  const denied = guard(ctx);
  if (denied) return denied;
  const input = await ctx.request.json().catch(() => null);
  const category = String(input?.category ?? '');
  const files: string[] = Array.isArray(input?.files) ? input.files.map(String) : [];
  if (!SLUG.test(category)) return json({ error: '분류를 골라 주세요.' }, 400);
  if (!files.length || files.some((f) => !FILE.test(f)) || new Set(files).size !== files.length) return json({ error: '글 목록이 잘못됐어요.' }, 400);
  try {
    const existing = new Map((await readDir(POSTS_DIR)).map((p) => [p.name, p.text]));
    const changes: { path: string; text: string }[] = [];
    const orders: Record<string, number> = {};
    for (const [i, file] of files.entries()) {
      const text = existing.get(file);
      if (text === undefined) return json({ error: '목록이 바뀌었어요. 새로 고침한 뒤 다시 해 주세요.' }, 409);
      const { data, body } = parseDoc(text);
      if (data.category !== category) return json({ error: '다른 분류의 글이 섞였어요. 새로 고침한 뒤 다시 해 주세요.' }, 409);
      const order = START + i;
      orders[file] = order;
      if (data.order === order) continue;
      changes.push({ path: `${POSTS_DIR}/${file}`, text: writeDoc({ ...data, order }, body) });
    }
    if (changes.length) await commit(`글 순서 변경: ${category}`, changes);
    return json({ ok: true, orders, changed: changes.length });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 502);
  }
};
