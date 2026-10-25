// 게시판 사진 준비: 1MB가 넘는 사진은 브라우저에서 JPG로 줄여서 1MB 아래로 맞춥니다.
export const LIMIT = 1024 * 1024;
const MAX_SIDE = 2560;

export type Prepared = { blob: Blob; preview: string; width: number; height: number; original: number; compressed: boolean };

async function decode(file: Blob) {
  // 휴대폰 사진의 회전 정보(EXIF)를 반영해서 엽니다.
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {}
  }
  const src = URL.createObjectURL(file);
  try {
    const img = document.createElement('img');
    img.src = src;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(src);
  }
}
const sizeOf = (img: ImageBitmap | HTMLImageElement) =>
  img instanceof HTMLImageElement ? [img.naturalWidth, img.naturalHeight] : [img.width, img.height];

function toJpeg(img: ImageBitmap | HTMLImageElement, w: number, h: number, quality: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; // 투명한 부분은 흰색으로
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('압축 실패'))), 'image/jpeg', quality));
}

// limit: 이 크기를 넘을 때만 줄입니다 (방문자 글 1MB, 관리자 공지 4MB)
export async function compressImage(file: File, limit = LIMIT): Promise<Prepared> {
  if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) throw new Error('사진 파일이 아니에요.');
  const img = await decode(file);
  const [w0, h0] = sizeOf(img);
  if (!w0 || !h0) throw new Error('사진을 열 수 없어요.');
  if (file.size <= limit) {
    if ('close' in img) img.close();
    return { blob: file, preview: URL.createObjectURL(file), width: w0, height: h0, original: file.size, compressed: false };
  }
  let scale = limit > LIMIT ? 1 : Math.min(1, MAX_SIDE / Math.max(w0, h0));
  let blob: Blob | null = null;
  let w = w0;
  let h = h0;
  for (let round = 0; round < 8; round++) {
    w = Math.max(1, Math.round(w0 * scale));
    h = Math.max(1, Math.round(h0 * scale));
    for (const q of limit > LIMIT ? [0.95, 0.92, 0.88] : [0.88, 0.8, 0.7]) {
      blob = await toJpeg(img, w, h, q);
      if (blob.size <= limit) break;
    }
    if (blob!.size <= limit) break;
    scale *= 0.8;
  }
  if ('close' in img) img.close();
  return { blob: blob!, preview: URL.createObjectURL(blob!), width: w, height: h, original: file.size, compressed: true };
}
