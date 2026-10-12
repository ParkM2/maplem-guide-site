import type { APIRoute } from 'astro';
import { url } from '../lib/site';

// 검색엔진(구글, 네이버 등)에게 어디를 읽어도 되는지 알려 주는 파일
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL(url('/sitemap.xml'), site).href;
  const body = [
    'User-agent: *',
    'Allow: /',
    `Disallow: ${url('/admin/')}`,
    `Disallow: ${url('/api/')}`,
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
