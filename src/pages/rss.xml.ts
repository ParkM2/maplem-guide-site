import type { APIRoute } from 'astro';
import { SITE_NAME, SITE_DESC, getCategories, getPosts, postUrl, url } from '../lib/site';

// RSS: 네이버 서치어드바이저에 제출하면 새 글을 더 빨리 가져갑니다.
export const GET: APIRoute = async ({ site }) => {
  const categories = await getCategories();
  const posts = (await getPosts())
    .filter((p) => categories.some((c) => c.slug === p.data.category))
    .sort((a, b) => b.data.updated.valueOf() - a.data.updated.valueOf());
  const abs = (path: string) => new URL(path, site).href;
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const items = posts
    .map((p) => {
      const link = abs(postUrl(p));
      const cat = categories.find((c) => c.slug === p.data.category)?.name ?? '';
      return [
        '    <item>',
        `      <title>${esc(p.data.title)}</title>`,
        `      <link>${esc(link)}</link>`,
        `      <guid isPermaLink="true">${esc(link)}</guid>`,
        `      <description>${esc(p.data.summary || p.data.title)}</description>`,
        cat && `      <category>${esc(cat)}</category>`,
        `      <pubDate>${p.data.updated.toUTCString()}</pubDate>`,
        '    </item>',
      ].filter(Boolean).join('\n');
    })
    .join('\n');

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0">\n  <channel>\n' +
    `    <title>${esc(SITE_NAME)}</title>\n` +
    `    <link>${esc(abs(url('/')))}</link>\n` +
    `    <description>${esc(SITE_DESC)}</description>\n` +
    '    <language>ko</language>\n' +
    items +
    '\n  </channel>\n</rss>\n';
  return new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
};
