import type { APIRoute } from 'astro';
import { getCategories, getPosts, postUrl } from '../lib/site';

// 검색용 목록: 빌드할 때 한 번 만들어 두고, 검색창에서 받아서 브라우저 안에서 찾습니다.
const plain = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

export const GET: APIRoute = async () => {
  const cats = Object.fromEntries((await getCategories()).map((c) => [c.slug, c.name]));
  const posts = (await getPosts()).map((p) => ({
    t: p.data.title,
    u: postUrl(p),
    c: cats[p.data.category] ?? '',
    s: p.data.summary,
    g: p.data.tags,
    b: plain(p.body ?? '').slice(0, 20000),
  }));
  return new Response(JSON.stringify(posts), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
