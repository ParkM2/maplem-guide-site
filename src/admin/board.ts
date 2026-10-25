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
    const wait = d.posts.filter((p: any) => !p.answered).length;
    box.innerHTML =
      `<p class="hint">글 ${d.posts.length}개 · 답변 안 한 글 ${wait}개. 글을 누르면 새 탭에서 열려요. 비밀글도 비밀번호 없이 보이고, 관리자로 댓글을 달거나 지울 수 있어요.</p>` +
      '<ul class="wr-list">' +
      d.posts
        .map(
          (p: any) => `<li><a href="/board/${p.id}/" target="_blank" rel="noopener">
            <b>${p.secret ? '🔒 ' : ''}${esc(p.title)}${p.images ? ' 📷' : ''}${p.comments ? ` <span class="bd-c">[${p.comments}]</span>` : ''}</b>
            <span class="meta">${p.answered ? '<span class="bd-ok">답변 완료</span>' : '<span class="bd-wait">답변 전</span>'} · ${esc(p.name)} · ${when(p.created)} · 조회 ${p.views}</span>
          </a></li>`,
        )
        .join('') +
      '</ul>';
  } catch (e) {
    box.innerHTML = `<p class="hint">불러오지 못했어요: ${esc((e as Error).message)}</p>`;
  }
}
