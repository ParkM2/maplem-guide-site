import { compressImage, type Prepared } from '../lib/board-photo';
// admin 질문/의견 게시판: 비밀글도 비밀번호 없이 열 수 있는 목록
type Api = (path: string, init?: RequestInit) => Promise<any>;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const when = (d: string) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));

export async function loadBoard(api: Api) {
  const box = document.querySelector('#bd-admin') as HTMLElement;
  box.innerHTML = '<p class="hint">불러오는 중…</p>';
  try {
    const d = await api('/api/board/list');
    if (!d.configured) {
      box.innerHTML = '<p class="hint">게시판은 방문 통계와 같은 저장소(Neon)를 써요. 방문 통계 화면의 안내대로 저장소를 연결하면 게시판이 열려요.</p>';
      return;
    }
    if (!d.posts.length) {
      box.innerHTML = '<p class="hint">아직 글이 없어요.</p>';
      return;
    }
    const wait = d.posts.filter((p: any) => !p.answered && !p.notice).length;
    box.innerHTML =
      `<p class="hint">글 ${d.posts.length}개 · 답변 안 한 글 ${wait}개. 글을 누르면 새 탭에서 열려요. 비밀글도 비밀번호 없이 보이고, 관리자로 댓글을 달거나 지울 수 있어요.</p>` +
      '<ul class="wr-list">' +
      d.posts
        .map(
          (p: any) => `<li><a href="/board/${p.id}/" target="_blank" rel="noopener">
            <b>${p.notice ? '<span class="bd-ok">[공지]</span> ' : ''}${p.secret ? '🔒 ' : ''}${esc(p.title)}${p.images ? ' 📷' : ''}${p.comments ? ` <span class="bd-c">[${p.comments}]</span>` : ''}</b>
            <span class="meta">${p.notice ? '' : p.answered ? '<span class="bd-ok">답변 완료</span> · ' : '<span class="bd-wait">답변 전</span> · '}${esc(p.name)} · ${when(p.created)} · 조회 ${p.views}</span>
          </a></li>`,
        )
        .join('') +
      '</ul>';
  } catch (e) {
    box.innerHTML = `<p class="hint">불러오지 못했어요: ${esc((e as Error).message)}</p>`;
  }
}

// ---------- 공지 쓰기 ----------

const NOTICE_LIMIT = 4 * 1024 * 1024;
const q = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
let photos: Prepared[] = [];
let preparing = 0;
let toastRef: (m: string, err?: boolean) => void = (m) => alert(m);
let apiRef: Api;

export function setupNotice(api: Api, toast: (m: string, err?: boolean) => void) {
  apiRef = api;
  toastRef = toast;
  const form = q<HTMLFormElement>('#nt-form');
  const files = q<HTMLInputElement>('#nt-files');
  const submit = q<HTMLButtonElement>('#nt-submit');
  const field = (n: string) => form.querySelector(`[name=${n}]`) as HTMLInputElement;
  const reset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    photos = [];
    form.reset();
    render();
  };
  q('#nt-open').addEventListener('click', () => {
    form.hidden = false;
    field('title').focus();
  });
  q('#nt-cancel').addEventListener('click', () => {
    reset();
    form.hidden = true;
  });
  files.addEventListener('change', async () => {
    const picked = Array.from(files.files ?? []);
    files.value = '';
    preparing++;
    submit.disabled = true;
    for (const f of picked) {
      try {
        photos.push(await compressImage(f, NOTICE_LIMIT));
      } catch {
        toastRef(`"${f.name}"은(는) 열 수 없는 사진이에요.`, true);
      }
      render();
    }
    preparing--;
    submit.disabled = preparing > 0;
  });
  q('#nt-thumbs').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
    if (!b) return;
    const [p] = photos.splice(Number(b.dataset.i), 1);
    URL.revokeObjectURL(p.preview);
    render();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = field('title').value.trim();
    const body = field('body').value;
    if (!title) return toastRef('공지 제목을 입력해 주세요.', true);
    if (!body.trim()) return toastRef('공지 내용을 입력해 주세요.', true);
    submit.disabled = true;
    submit.textContent = '올리는 중…';
    try {
      const out = await apiRef('/api/board/write', { method: 'POST', body: JSON.stringify({ notice: true, title, body }) });
      let failed = 0;
      for (const [i, p] of photos.entries()) {
        submit.textContent = `사진 올리는 중 (${i + 1}/${photos.length})`;
        const r = await fetch(`/api/board/photo?post=${out.id}&t=${encodeURIComponent(out.t)}&w=${p.width}&h=${p.height}`, {
          method: 'POST',
          headers: { 'content-type': p.blob.type || 'application/octet-stream' },
          body: p.blob,
        }).catch(() => null);
        if (!r || !r.ok) failed++;
      }
      toastRef(failed ? `공지를 올렸어요. 사진 ${failed}장은 올리지 못했어요.` : '공지를 올렸어요.', failed > 0);
      reset();
      form.hidden = true;
      loadBoard(apiRef);
    } catch (err) {
      toastRef((err as Error).message, true);
    } finally {
      submit.disabled = false;
      submit.textContent = '공지 올리기';
    }
  });
}

function render() {
  q('#nt-thumbs').innerHTML = photos
    .map(
      (p, i) => `<li><img src="${p.preview}" alt="" /><span>${p.compressed ? `${size(p.original)} → ${size(p.blob.size)}` : size(p.blob.size)}</span>
        <button type="button" data-i="${i}" aria-label="이 사진 빼기">×</button></li>`,
    )
    .join('');
  q('#nt-count').textContent = photos.length ? `사진 ${photos.length}장` : '';
}
