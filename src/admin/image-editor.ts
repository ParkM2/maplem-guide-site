// 사진 편집 창: 선택과 나누기, 자르기, 회전, 반전, 모자이크, 흐리게, 펜, 형광펜, 네모, 화살표, 글자
type Tool = 'select' | 'crop' | 'mosaic' | 'blur' | 'pen' | 'marker' | 'rect' | 'arrow' | 'text';

// 적용하면 고친 사진(src)을, 나누기를 하면 두 번째 사진(split)도 함께 돌려줍니다.
export type ImageEditResult = { src: string; split?: string };

const TOOLS: [Tool, string][] = [
  ['select', '⬚ 선택'],
  ['crop', '✂ 자르기'],
  ['mosaic', '▦ 모자이크'],
  ['blur', '◌ 흐리게'],
  ['pen', '✎ 펜'],
  ['marker', '▬ 형광펜'],
  ['rect', '▢ 네모'],
  ['arrow', '➜ 화살표'],
  ['text', 'T 글자'],
];

const MAX_WIDTH = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && new URL(src, location.href).origin !== location.origin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('사진을 불러오지 못했어요. 저장 직후라면 1~2분 뒤 다시 해 주세요.'));
    img.src = src;
  });
}

function copyOf(c: HTMLCanvasElement) {
  const n = document.createElement('canvas');
  n.width = c.width;
  n.height = c.height;
  n.getContext('2d')!.drawImage(c, 0, 0);
  return n;
}

function toUrl(c: HTMLCanvasElement) {
  const webp = c.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.85);
}

function part(src: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

export async function openImageEditor(src: string): Promise<ImageEditResult | null> {
  const img = await loadImage(src);

  const back = document.createElement('div');
  back.className = 'ie-back';
  back.innerHTML = `
    <div class="ie" role="dialog" aria-label="사진 편집">
      <div class="ie-bar">
        ${TOOLS.map(([t, label]) => `<button type="button" data-tool="${t}">${label}</button>`).join('')}
        <span class="grow"></span>
        <button type="button" data-act="rotl" title="왼쪽으로 돌리기">⟲ 회전</button>
        <button type="button" data-act="rotr" title="오른쪽으로 돌리기">⟳ 회전</button>
        <button type="button" data-act="flip" title="좌우 뒤집기">⇋ 반전</button>
        <button type="button" data-act="undo" title="되돌리기">↶ 되돌리기</button>
      </div>
      <div class="ie-opts"></div>
      <div class="ie-stage"><div class="ie-wrap"><canvas class="cv"></canvas><canvas class="ov"></canvas></div></div>
      <div class="ie-foot">
        <span class="hint ie-info" style="margin-right:auto"></span>
        <button type="button" data-act="cancel">취소</button>
        <button type="button" class="primary" data-act="apply">적용</button>
      </div>
    </div>`;
  document.body.appendChild(back);

  const cv = back.querySelector<HTMLCanvasElement>('canvas.cv')!;
  const ov = back.querySelector<HTMLCanvasElement>('canvas.ov')!;
  const ctx = cv.getContext('2d')!;
  const octx = ov.getContext('2d')!;
  const opts = back.querySelector<HTMLElement>('.ie-opts')!;
  const info = back.querySelector<HTMLElement>('.ie-info')!;

  // 큰 사진은 먼저 가로 1600px로 줄여서 편집합니다.
  const scale0 = Math.min(1, MAX_WIDTH / img.naturalWidth);
  cv.width = Math.round(img.naturalWidth * scale0);
  cv.height = Math.round(img.naturalHeight * scale0);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);

  const state = { tool: 'select' as Tool, color: '#e03131', size: 4, block: 12, blur: 8, font: 36, outline: true };
  const hist: HTMLCanvasElement[] = [];
  let sel: { x: number; y: number; w: number; h: number } | null = null;
  const snap = () => {
    hist.push(copyOf(cv));
    if (hist.length > 30) hist.shift();
  };
  const syncSize = () => {
    ov.width = cv.width;
    ov.height = cv.height;
    info.textContent = `${cv.width} × ${cv.height}`;
  };
  const restore = (c: HTMLCanvasElement) => {
    cv.width = c.width;
    cv.height = c.height;
    ctx.drawImage(c, 0, 0);
    syncSize();
  };
  syncSize();

  // 화면에 줄여 보이는 비율 (선 굵기와 글자 크기를 화면 기준으로 맞춤)
  const k = () => cv.width / cv.getBoundingClientRect().width || 1;

  function renderOpts() {
    const color = `<label>색 <input type="color" data-o="color" value="${state.color}"></label>`;
    const size = `<label>굵기 <input type="range" data-o="size" min="1" max="20" value="${state.size}"></label>`;
    const html: Record<Tool, string> = {
      select: `나눌 부분을 끌어서 고르세요. <button type="button" class="strong" data-act="split" ${sel ? '' : 'disabled'}>✂ 나누기</button>
               <button type="button" data-act="unselect" ${sel ? '' : 'disabled'}>선택 해제</button>
               <small>가장자리까지 끌어 고르면 사진이 그 선에서 두 장으로 나뉘고, 가운데 일부만 고르면 원본은 그대로 두고 고른 부분이 새 사진으로 하나 더 생겨요.</small>`,
      crop: '남길 부분을 끌어서 고르면 바로 잘려요.',
      mosaic: `가릴 부분을 끌어서 고르세요. <label>모자이크 크기 <input type="range" data-o="block" min="4" max="40" value="${state.block}"></label>`,
      blur: `흐리게 할 부분을 끌어서 고르세요. <label>세기 <input type="range" data-o="blur" min="2" max="24" value="${state.blur}"></label>`,
      pen: `${color} ${size}`,
      marker: `${color} ${size}`,
      rect: `${color} ${size}`,
      arrow: `${color} ${size}`,
      text: `글자를 넣을 곳을 누르세요. ${color} <label>크기 <input type="range" data-o="font" min="12" max="96" value="${state.font}"></label>
             <label><input type="checkbox" data-o="outline" ${state.outline ? 'checked' : ''}> 흰 테두리</label>`,
    };
    opts.innerHTML = html[state.tool];
    back.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === state.tool));
  }
  opts.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    const key = el.dataset.o as keyof typeof state;
    if (!key) return;
    (state as any)[key] = el.type === 'checkbox' ? el.checked : el.type === 'color' ? el.value : Number(el.value);
  });
  renderOpts();

  // ---- 영역 효과 ----
  function pixelate(x: number, y: number, w: number, h: number) {
    const b = Math.max(2, Math.round(state.block * k()));
    const t = document.createElement('canvas');
    t.width = Math.max(1, Math.ceil(w / b));
    t.height = Math.max(1, Math.ceil(h / b));
    t.getContext('2d')!.drawImage(cv, x, y, w, h, 0, 0, t.width, t.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(t, 0, 0, t.width, t.height, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
  }
  function blur(x: number, y: number, w: number, h: number) {
    // 여러 번 줄였다 늘려서 흐리게 합니다 (모든 브라우저에서 동작).
    const f = Math.max(2, state.blur * k());
    let t = document.createElement('canvas');
    t.width = w;
    t.height = h;
    t.getContext('2d')!.drawImage(cv, x, y, w, h, 0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('canvas');
      s.width = Math.max(1, Math.round(w / f));
      s.height = Math.max(1, Math.round(h / f));
      const sc = s.getContext('2d')!;
      sc.imageSmoothingQuality = 'high';
      sc.drawImage(t, 0, 0, s.width, s.height);
      const u = document.createElement('canvas');
      u.width = w;
      u.height = h;
      const uc = u.getContext('2d')!;
      uc.imageSmoothingQuality = 'high';
      uc.drawImage(s, 0, 0, w, h);
      t = u;
    }
    ctx.drawImage(t, x, y);
  }
  function crop(x: number, y: number, w: number, h: number) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(cv, x, y, w, h, 0, 0, w, h);
    restore(c);
  }
  function arrow(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    const lw = state.size * k();
    const head = Math.max(10, lw * 4);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    c.strokeStyle = c.fillStyle = state.color;
    c.lineWidth = lw;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2 - Math.cos(ang) * head * 0.8, y2 - Math.sin(ang) * head * 0.8);
    c.stroke();
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
    c.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
    c.closePath();
    c.fill();
  }
  function rect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    c.strokeStyle = state.color;
    c.lineWidth = state.size * k();
    c.lineJoin = 'round';
    c.strokeRect(x, y, w, h);
  }
  function text(x: number, y: number) {
    const value = window.prompt('넣을 글자를 입력하세요');
    if (!value) return;
    snap();
    const px = Math.round(state.font * k());
    ctx.font = `700 ${px}px "IBM Plex Sans KR", sans-serif`;
    ctx.textBaseline = 'middle';
    value.split('\n').forEach((line, i) => {
      const ly = y + i * px * 1.25;
      if (state.outline) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, px / 6);
        ctx.lineJoin = 'round';
        ctx.strokeText(line, x, ly);
      }
      ctx.fillStyle = state.color;
      ctx.fillText(line, x, ly);
    });
  }

  // ---- 선택 ----
  // 가장자리 가까이(4%)까지 끌면 가장자리에 딱 붙입니다.
  const snapBox = (b: { x: number; y: number; w: number; h: number }) => {
    const tx = cv.width * 0.04;
    const ty = cv.height * 0.04;
    let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
    if (x1 < tx) x1 = 0;
    if (y1 < ty) y1 = 0;
    if (cv.width - x2 < tx) x2 = cv.width;
    if (cv.height - y2 < ty) y2 = cv.height;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };
  function drawSel(b: { x: number; y: number; w: number; h: number }) {
    octx.clearRect(0, 0, ov.width, ov.height);
    octx.fillStyle = 'rgba(0,0,0,.45)';
    octx.fillRect(0, 0, ov.width, ov.height);
    octx.clearRect(b.x, b.y, b.w, b.h);
    octx.setLineDash([8 * k(), 6 * k()]);
    octx.lineWidth = 2 * k();
    octx.strokeStyle = '#4dabf7';
    octx.strokeRect(b.x, b.y, b.w, b.h);
    octx.setLineDash([]);
  }
  function clearSel() {
    sel = null;
    octx.clearRect(0, 0, ov.width, ov.height);
    if (state.tool === 'select') renderOpts();
  }
  // 나누기: 가장자리에 닿은 띠 모양이면 두 조각으로, 아니면 원본 + 고른 부분
  function split(): ImageEditResult | null {
    if (!sel) return null;
    const { x, y, w, h } = sel;
    const W = cv.width;
    const H = cv.height;
    if (w >= W && h >= H) return null;
    let a: HTMLCanvasElement;
    let b: HTMLCanvasElement;
    if (w >= W && y === 0) (a = part(cv, 0, 0, W, h)), (b = part(cv, 0, h, W, H - h));
    else if (w >= W && y + h >= H) (a = part(cv, 0, 0, W, y)), (b = part(cv, 0, y, W, h));
    else if (h >= H && x === 0) (a = part(cv, 0, 0, w, H)), (b = part(cv, w, 0, W - w, H));
    else if (h >= H && x + w >= W) (a = part(cv, 0, 0, x, H)), (b = part(cv, x, 0, w, H));
    else (a = copyOf(cv)), (b = part(cv, x, y, w, h));
    return { src: toUrl(a), split: toUrl(b) };
  }

  // ---- 마우스, 손가락 입력 ----
  let start: { x: number; y: number } | null = null;
  let last: { x: number; y: number } | null = null;
  const pos = (e: PointerEvent) => {
    const r = ov.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(cv.width, ((e.clientX - r.left) * cv.width) / r.width)),
      y: Math.max(0, Math.min(cv.height, ((e.clientY - r.top) * cv.height) / r.height)),
    };
  };
  const box = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const x = Math.round(Math.min(a.x, b.x));
    const y = Math.round(Math.min(a.y, b.y));
    return { x, y, w: Math.round(Math.abs(a.x - b.x)), h: Math.round(Math.abs(a.y - b.y)) };
  };
  const strokeStyle = () => {
    ctx.strokeStyle = state.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (state.tool === 'marker') {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = state.size * 4 * k();
    } else {
      ctx.globalAlpha = 1;
      ctx.lineWidth = state.size * k();
    }
  };

  ov.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = pos(e);
    if (state.tool === 'text') return text(p.x, p.y);
    ov.setPointerCapture(e.pointerId);
    start = last = p;
    if (state.tool === 'pen' || state.tool === 'marker') {
      snap();
      // 형광펜은 겹쳐도 진해지지 않게 덧그림판에 그렸다가 한 번에 합칩니다.
    }
  });
  ov.addEventListener('pointermove', (e) => {
    if (!start || !last) return;
    const p = pos(e);
    octx.clearRect(0, 0, ov.width, ov.height);
    if (state.tool === 'pen') {
      strokeStyle();
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      last = p;
      return;
    }
    if (state.tool === 'marker') {
      last = p;
      markerPath.push(p);
      octx.save();
      octx.globalAlpha = 0.35;
      octx.strokeStyle = state.color;
      octx.lineWidth = state.size * 4 * k();
      octx.lineCap = octx.lineJoin = 'round';
      octx.beginPath();
      octx.moveTo(start.x, start.y);
      markerPath.forEach((q) => octx.lineTo(q.x, q.y));
      octx.stroke();
      octx.restore();
      return;
    }
    const b = box(start, p);
    if (state.tool === 'select') return drawSel(snapBox(b));
    if (state.tool === 'arrow') return arrow(octx, start.x, start.y, p.x, p.y);
    if (state.tool === 'rect') return rect(octx, b.x, b.y, b.w, b.h);
    // 자르기, 모자이크, 흐리게: 고른 영역 표시
    octx.fillStyle = 'rgba(0,0,0,.45)';
    if (state.tool === 'crop') {
      octx.fillRect(0, 0, ov.width, ov.height);
      octx.clearRect(b.x, b.y, b.w, b.h);
    }
    octx.setLineDash([8 * k(), 6 * k()]);
    octx.lineWidth = 2 * k();
    octx.strokeStyle = '#fff';
    octx.strokeRect(b.x, b.y, b.w, b.h);
    octx.setLineDash([]);
  });
  let markerPath: { x: number; y: number }[] = [];
  const end = (e: PointerEvent) => {
    if (!start) return;
    const p = pos(e);
    const b = box(start, p);
    octx.clearRect(0, 0, ov.width, ov.height);
    const t = state.tool;
    if (t === 'select') {
      sel = b.w >= 3 && b.h >= 3 ? snapBox(b) : null;
      if (sel) drawSel(sel);
      renderOpts();
      start = last = null;
      return;
    }
    if (t === 'marker' && markerPath.length) {
      ctx.save();
      strokeStyle();
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      markerPath.forEach((q) => ctx.lineTo(q.x, q.y));
      ctx.stroke();
      ctx.restore();
    } else if (b.w >= 3 && b.h >= 3) {
      if (t === 'crop') snap(), crop(b.x, b.y, b.w, b.h);
      if (t === 'mosaic') snap(), pixelate(b.x, b.y, b.w, b.h);
      if (t === 'blur') snap(), blur(b.x, b.y, b.w, b.h);
      if (t === 'rect') snap(), rect(ctx, b.x, b.y, b.w, b.h);
    }
    if (t === 'arrow' && Math.hypot(p.x - start.x, p.y - start.y) > 5) snap(), arrow(ctx, start.x, start.y, p.x, p.y);
    ctx.globalAlpha = 1;
    start = last = null;
    markerPath = [];
  };
  ov.addEventListener('pointerup', end);
  ov.addEventListener('pointercancel', () => {
    start = last = null;
    markerPath = [];
    octx.clearRect(0, 0, ov.width, ov.height);
    if (sel && state.tool === 'select') drawSel(sel);
  });

  // ---- 회전, 반전, 되돌리기 ----
  function rotate(dir: 1 | -1) {
    snap();
    const c = document.createElement('canvas');
    c.width = cv.height;
    c.height = cv.width;
    const cc = c.getContext('2d')!;
    cc.translate(c.width / 2, c.height / 2);
    cc.rotate((dir * Math.PI) / 2);
    cc.drawImage(cv, -cv.width / 2, -cv.height / 2);
    restore(c);
  }
  function flip() {
    snap();
    const c = copyOf(cv);
    ctx.save();
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.translate(cv.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  return new Promise((resolve) => {
    const close = (result: ImageEditResult | null) => {
      document.removeEventListener('keydown', onKey);
      back.remove();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const h = hist.pop();
        if (h) restore(h), clearSel();
      }
    };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const toolBtn = el.closest<HTMLButtonElement>('[data-tool]');
      if (toolBtn) {
        state.tool = toolBtn.dataset.tool as Tool;
        sel = null;
        octx.clearRect(0, 0, ov.width, ov.height);
        renderOpts();
        return;
      }
      const act = el.closest<HTMLButtonElement>('[data-act]')?.dataset.act;
      if (act === 'rotl' || act === 'rotr' || act === 'flip' || act === 'undo') clearSel();
      if (act === 'rotl') rotate(-1);
      if (act === 'rotr') rotate(1);
      if (act === 'flip') flip();
      if (act === 'undo') {
        const h = hist.pop();
        if (h) restore(h);
      }
      if (act === 'unselect') clearSel();
      if (act === 'split') {
        try {
          const r = split();
          if (!r) return alert('사진 전체가 아닌 일부를 골라 주세요.');
          close(r);
        } catch {
          alert('이 사진은 다른 사이트에서 가져온 것이라 편집할 수 없어요. 파일로 받아서 다시 넣어 주세요.');
        }
        return;
      }
      if (act === 'cancel') close(null);
      if (act === 'apply') {
        try {
          if (!hist.length && scale0 === 1) return close(null); // 바뀐 게 없음
          close({ src: toUrl(cv) });
        } catch {
          alert('이 사진은 다른 사이트에서 가져온 것이라 편집할 수 없어요. 파일로 받아서 다시 넣어 주세요.');
        }
      }
    });
  });
}
