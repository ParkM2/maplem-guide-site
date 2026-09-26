import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import rehypeRaw from 'rehype-raw';
import rehypeMedia from './src/plugins/rehype-media.mjs';

// 기본은 Vercel(주소 맨 앞에 바로 사이트가 있음).
// GitHub Pages처럼 하위 경로에 올릴 때만 BASE_PATH를 지정합니다. 예: BASE_PATH=/maplem-guide-site
const base = process.env.BASE_PATH || '/';

// Vercel은 빌드할 때 VERCEL_PROJECT_PRODUCTION_URL(예: maplem-guide-site.vercel.app)을 넣어 줍니다.
// 개인 도메인을 연결하면 SITE_URL 환경 변수로 덮어쓰면 됩니다.
const site =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  'https://maplem-guide-site.vercel.app';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  // 공략 페이지는 모두 미리 만들어 두고, /api/* (글쓰기 저장)만 Vercel 서버 함수로 동작합니다.
  adapter: vercel(),
  markdown: {
    // 편집기가 저장한 HTML 본문을 실제 요소로 바꾼 뒤 이미지 처리
    rehypePlugins: [rehypeRaw, [rehypeMedia, { base }]],
  },
});
