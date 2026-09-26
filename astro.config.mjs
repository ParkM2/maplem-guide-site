import { defineConfig } from 'astro/config';
import rehypeMedia from './src/plugins/rehype-media.mjs';

// GitHub Pages 주소: https://parkm2.github.io/maplem-guide-site
// 개인 도메인을 연결하면 site를 새 주소로 바꾸고 base를 '/'로 바꾸면 됩니다.
const base = '/maplem-guide-site';

export default defineConfig({
  site: 'https://parkm2.github.io',
  base,
  trailingSlash: 'always',
  markdown: {
    rehypePlugins: [[rehypeMedia, { base }]],
  },
});
