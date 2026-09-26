// 빌드 후 dist/media 안의 스크린샷을 가로 1600px 이하로 줄이고 다시 압축합니다.
// 파일 이름과 형식은 그대로 두므로 글 안의 링크는 바뀌지 않습니다.
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const dir = new URL('../dist/media/', import.meta.url).pathname;
const MAX_WIDTH = 1600;

async function* files(d) {
  let entries = [];
  try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(d, e.name);
    if (e.isDirectory()) yield* files(p);
    else yield p;
  }
}

let saved = 0;
for await (const file of files(dir)) {
  const ext = extname(file).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) continue;
  const before = (await stat(file)).size;
  let img = sharp(file).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true });
  if (ext === '.png') img = img.png({ compressionLevel: 9, palette: true, quality: 85 });
  else if (ext === '.webp') img = img.webp({ quality: 80 });
  else img = img.jpeg({ quality: 80, mozjpeg: true });
  const out = await img.toBuffer();
  if (out.length < before) {
    await writeFile(file, out);
    saved += before - out.length;
  }
}
console.log(`media: ${(saved / 1024).toFixed(0)} KB 줄임`);
