// 빌드 후 Vercel 설정(.vercel/output/config.json)에 예전 주소 → 새 주소 이동 규칙을 맨 앞에 넣습니다.
// maplem-guide-site.vercel.app 으로 들어오면 같은 경로의 https://maplem-guide.co.kr 로 영구 이동(308)합니다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const OLD_HOST = 'maplem-guide-site.vercel.app';
const NEW_SITE = 'https://maplem-guide.co.kr';

const file = new URL('../.vercel/output/config.json', import.meta.url).pathname;
if (!existsSync(file)) process.exit(0); // Vercel 빌드가 아닐 때(로컬 dist)는 할 일 없음

const config = JSON.parse(readFileSync(file, 'utf8'));
config.routes = (config.routes || []).filter((r) => !(r.has || []).some((h) => h.type === 'host' && h.value === OLD_HOST));
config.routes.unshift({
  src: '^/(.*)$',
  has: [{ type: 'host', value: OLD_HOST }],
  status: 308,
  headers: { Location: `${NEW_SITE}/$1` },
});
writeFileSync(file, JSON.stringify(config, null, '\t'));
console.log(`redirect: ${OLD_HOST} → ${NEW_SITE}`);
