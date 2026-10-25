import { defineConfig, passthroughImageService } from 'astro/config';
import vercel from '@astrojs/vercel';
import rehypeRaw from 'rehype-raw';
import rehypeMedia from './src/plugins/rehype-media.mjs';

// 기본은 Vercel(주소 맨 앞에 바로 사이트가 있음).
// GitHub Pages처럼 하위 경로에 올릴 때만 BASE_PATH를 지정합니다. 예: BASE_PATH=/maplem-guide-site
const base = process.env.BASE_PATH || '/';

// 사이트 대표 주소(검색엔진·공유 미리보기에 쓰임). 다른 주소로 바꿀 때만 SITE_URL 환경 변수로 덮어씁니다.
const site = process.env.SITE_URL || 'https://maplem-guide.co.kr';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  // 공략 페이지는 모두 미리 만들어 두고, /api/* (글쓰기 저장)만 Vercel 서버 함수로 동작합니다.
  adapter: vercel(),
  // 사이트는 Astro의 그림 변환 기능을 쓰지 않습니다(사진은 빌드 뒤 scripts/optimize-media.mjs가 줄임).
  // 이렇게 해 두면 서버 함수에 그림 도구(sharp, 약 37MB)가 들어가지 않아 서버가 더 빨리 깨어납니다.
  image: { service: passthroughImageService() },
  markdown: {
    // 편집기가 저장한 HTML 본문을 실제 요소로 바꾼 뒤 이미지 처리
    rehypePlugins: [rehypeRaw, [rehypeMedia, { base }]],
  },
});
