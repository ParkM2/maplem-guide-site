import type { APIRoute } from 'astro';
import { getCategories, getPosts, postUrl, url } from '../lib/site';

// 사이트맵: 검색엔진에 모든 공략 글 주소를 한 번에 알려 줍니다. 글을 올리면 자동으로 늘어납니다.
export const GET: APIRoute = async ({ site }) => {
  const categories = await getCategories();
  const posts = (await getPosts()).filter((p) => categories.some((c) => c.slug === p.data.category));
  const abs = (path: string) => new URL(path, site).href;
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const latest = (list: typeof posts) =>
    list.length ? day(new Date(Math.max(...list.map((p) => p.data.updated.valueOf())))) : undefined;

  const entries: { loc: string; lastmod?: string }[] = [
    { loc: abs(url('/')), lastmod: latest(posts) },
    ...categories.map((c) => ({
      loc: abs(url(`/${c.slug}/`)),
      lastmod: latest(posts.filter((p) => p.data.category === c.slug)),
    })),
    ...posts.map((p) => ({ loc: abs(postUrl(p)), lastmod: day(p.data.updated) })),
    { loc: abs(url('/about/')) },
    { loc: abs(url('/calc/')) },
  ];

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries
      .map((e) => `  <url><loc>${esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
      .join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
