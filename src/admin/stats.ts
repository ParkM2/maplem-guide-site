// 방문 통계 화면: 방문 분석, 사용자 분석, 콘텐츠 분석
type Row = { name: string; n: number };
type Api = (path: string, init?: RequestInit) => Promise<any>;

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const num = (n: number) => (n ?? 0).toLocaleString('ko-KR');
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const dur = (s: number | null) => {
  if (!s) return '-';
  const m = Math.floor(s / 60);
  return m ? `${m}분 ${s % 60}초` : `${s}초`;
};
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const COUNTRY: Record<string, string> = {
  KR: '한국', US: '미국', JP: '일본', CN: '중국', TW: '대만', HK: '홍콩', VN: '베트남', TH: '태국', PH: '필리핀',
  SG: '싱가포르', CA: '캐나다', AU: '호주', DE: '독일', GB: '영국', FR: '프랑스', ID: '인도네시아', MY: '말레이시아',
};

let range = '7';
let metric: 'pv' | 'uv' | 'visits' = 'pv';
let last: any = null;
let apiRef: Api;

$('#st-range').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-r]');
  if (!b) return;
  range = b.dataset.r!;
  document.querySelectorAll('#st-range button').forEach((x) => x.classList.toggle('on', x === b));
  loadStats(apiRef);
});
$('#st-body').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-m]');
  if (!b || !last) return;
  metric = b.dataset.m as typeof metric;
  render(last);
});

export async function loadStats(api: Api) {
  apiRef = api;
  const body = $('#st-body');
  body.style.opacity = '0.5';
  try {
    const data = await api(`/api/stats?range=${range}`);
    last = data;
    if (!data.configured) body.innerHTML = setupHelp();
    else render(data);
  } catch (err) {
    body.innerHTML = `<p class="st-empty">${esc((err as Error).message)}</p>`;
  } finally {
    body.style.opacity = '';
  }
}

function setupHelp() {
  return `<div class="st-card st-setup">
    <h3>방문 기록을 저장할 곳을 한 번 연결해 주세요</h3>
    <ol>
      <li>vercel.com에서 maplem-guide-site 프로젝트를 열고 위쪽 <b>Storage</b> 탭을 누릅니다.</li>
      <li><b>Create Database</b>에서 <b>Neon</b> (Serverless Postgres)을 고르고 <b>Continue</b>를 누릅니다.</li>
      <li>Region은 <b>Singapore</b>나 <b>Tokyo</b>처럼 가까운 곳, 요금제는 <b>Free</b>를 고르고 만듭니다.</li>
      <li>만든 뒤 <b>Connect Project</b>로 maplem-guide-site를 연결합니다.</li>
      <li><b>Deployments</b> 탭에서 맨 위 배포를 <b>Redeploy</b> 합니다.</li>
    </ol>
    <p class="hint">연결한 뒤부터 방문이 기록돼요. 이전 방문은 볼 수 없어요.</p>
  </div>`;
}

function delta(cur: number, prev: number, unit = '%') {
  if (cur == null || prev == null) return '';
  if (unit === 'p') {
    const d = Math.round((cur - prev) * 10) / 10;
    return d === 0 ? '이전과 같음' : `이전보다 ${d > 0 ? '▲' : '▼'} ${Math.abs(d)}%p`;
  }
  if (!prev) return cur ? '이전 기록 없음' : '';
  const d = Math.round(((cur - prev) / prev) * 100);
  return d === 0 ? '이전과 같음' : `이전보다 ${d > 0 ? '▲' : '▼'} ${Math.abs(d)}%`;
}

function tile(label: string, value: string, d: string, help = '') {
  return `<div class="st-tile" title="${esc(help)}"><div class="l">${label}</div><div class="v">${value}</div><div class="d">${d || '&nbsp;'}</div></div>`;
}

function bars(rows: Row[], total?: number, fmt = (r: Row) => num(r.n)) {
  if (!rows?.length) return `<div class="st-empty">아직 기록이 없어요.</div>`;
  const max = Math.max(...rows.map((r) => r.n));
  const sum = total ?? rows.reduce((a, r) => a + r.n, 0);
  return `<div class="st-bars">${rows
    .map(
      (r) => `<div class="st-bar"><span class="name" title="${esc(r.name)}">${esc(r.name)}</span>
        <span class="num">${fmt(r)} · ${pct(r.n, sum)}%</span>
        <span class="track"><span class="fill" style="width:${(r.n / max) * 100}%"></span></span></div>`,
    )
    .join('')}</div>`;
}

function cols(items: { label: string; tip: string; v: number }[], opts: { small?: boolean; every?: number } = {}) {
  const max = Math.max(1, ...items.map((i) => i.v));
  const every = opts.every ?? 1;
  return `<div class="st-cols${opts.small ? ' small' : ''}" role="img" aria-label="막대 그래프">
      <span class="st-max">${num(max)}</span>
      ${items.map((i) => `<div class="st-col" data-tip="${esc(i.tip)}"><i style="height:${(i.v / max) * 100}%"></i></div>`).join('')}
    </div>
    <div class="st-axis">${items.map((i, n) => `<span>${n % every === 0 ? esc(i.label) : ''}</span>`).join('')}</div>`;
}

function card(title: string, inner: string, extra = '', cls = '') {
  return `<div class="st-card ${cls}"><h3>${title}${extra ? `<small>${extra}</small>` : ''}</h3>${inner}</div>`;
}

function trend(d: any) {
  const names = { pv: '조회수', uv: '순방문자수', visits: '방문 횟수' } as const;
  const byKey = new Map<string, any>(d.series.map((r: any) => [r.k, r]));
  const items: { label: string; tip: string; v: number }[] = [];
  if (d.range.unit === 'hour') {
    for (let h = 0; h < 24; h++) {
      const k = String(h).padStart(2, '0');
      const v = byKey.get(k)?.[metric] ?? 0;
      items.push({ label: `${h}시`, tip: `${h}시 · ${names[metric]} ${num(v)}`, v });
    }
  } else {
    const start = new Date(new Date(d.range.start).getTime() + 9 * 3600e3);
    for (let i = 0; i < d.range.days; i++) {
      const day = new Date(start.getTime() + i * 86400e3);
      const k = day.toISOString().slice(0, 10);
      const v = byKey.get(k)?.[metric] ?? 0;
      const label = `${day.getUTCMonth() + 1}.${day.getUTCDate()}`;
      items.push({ label, tip: `${label}(${WEEK[day.getUTCDay()]}) · ${names[metric]} ${num(v)}`, v });
    }
  }
  // 화면 폭에 맞춰 날짜 글자가 겹치지 않을 만큼만 보여 줍니다.
  const room = Math.max(4, Math.floor(Math.min(window.innerWidth, 1080) / 56));
  const every = Math.max(1, Math.ceil(items.length / room));
  const tabs = (Object.keys(names) as (keyof typeof names)[])
    .map((m) => `<button type="button" data-m="${m}" class="${m === metric ? 'on' : ''}">${names[m]}</button>`)
    .join('');
  return card(d.range.unit === 'hour' ? '시간별 추이' : '일별 추이', `<div class="st-tabs">${tabs}</div>${cols(items, { every: d.range.unit === 'hour' ? Math.max(3, every) : every })}`, '', 'full');
}

function render(d: any) {
  const s = d.summary, p = d.prev;
  const pagesPerVisit = s.visits ? Math.round((s.pv / s.visits) * 10) / 10 : 0;
  const prevPagesPerVisit = p.visits ? Math.round((p.pv / p.visits) * 10) / 10 : 0;
  const returning = s.uv - s.new_uv;
  const retRate = pct(returning, s.uv), prevRet = pct(p.uv - p.new_uv, p.uv);
  const bounce = pct(s.bounced, s.visits), prevBounce = pct(p.bounced, p.visits);

  const hours = Array.from({ length: 24 }, (_, h) => {
    const v = d.hours.find((r: any) => r.k === h)?.n ?? 0;
    return { label: `${h}`, tip: `${h}시 · 조회수 ${num(v)}`, v };
  });
  const week = [1, 2, 3, 4, 5, 6, 0].map((k) => {
    const v = d.weekdays.find((r: any) => r.k === k)?.n ?? 0;
    return { label: WEEK[k], tip: `${WEEK[k]}요일 · 조회수 ${num(v)}`, v };
  });
  const countries = d.countries.map((r: Row) => ({ ...r, name: COUNTRY[r.name] ?? r.name }));
  const topPages = d.pages.length
    ? `<table class="st-table"><thead><tr><th>#</th><th>페이지</th><th class="n">조회수</th><th class="n">방문자</th><th class="n">평균 머문 시간</th></tr></thead><tbody>
        ${d.pages
          .map(
            (r: any, i: number) => `<tr><td>${i + 1}</td><td class="t"><a href="${esc(r.path)}" target="_blank" rel="noopener" title="${esc(r.title)}">${esc(r.title)}</a></td>
              <td class="n">${num(r.pv)}</td><td class="n">${num(r.uv)}</td><td class="n">${dur(r.dur)}</td></tr>`,
          )
          .join('')}</tbody></table>`
    : `<div class="st-empty">아직 기록이 없어요.</div>`;

  $('#st-body').innerHTML = `
    <div class="st-live"><span><span class="dot"></span>지금 보고 있는 사람 <b>${num(d.now.online)}</b>명 (최근 5분)</span><span>오늘 조회수 <b>${num(d.now.today_pv)}</b></span></div>

    <h2 class="st-h">방문 분석</h2>
    <div class="st-tiles">
      ${tile('조회수', num(s.pv), delta(s.pv, p.pv), '페이지를 연 횟수')}
      ${tile('순방문자수', num(s.uv), delta(s.uv, p.uv), '같은 사람이 여러 번 와도 한 명으로 셈')}
      ${tile('방문 횟수', num(s.visits), delta(s.visits, p.visits), '30분 넘게 쉬었다 오면 새 방문으로 셈')}
      ${tile('방문당 페이지', String(pagesPerVisit), delta(pagesPerVisit, prevPagesPerVisit), '한 번 방문할 때 평균으로 본 페이지 수')}
      ${tile('평균 머문 시간', dur(s.avg_visit_dur), '', '한 번 방문할 때 평균으로 머문 시간')}
      ${tile('재방문율', `${retRate}%`, delta(retRate, prevRet, 'p'), '전에 온 적 있는 방문자 비율')}
      ${tile('이탈률', `${bounce}%`, delta(bounce, prevBounce, 'p'), '한 페이지만 보고 나간 방문 비율 (낮을수록 좋음)')}
    </div>
    <div class="st-grid" style="margin-top:12px">${trend(d)}</div>

    <h2 class="st-h">사용자 분석</h2>
    <div class="st-grid">
      ${card('유입 경로', bars(d.sources), '방문 횟수')}
      ${card('유입 사이트', bars(d.refs), '방문 횟수')}
      ${card('시간대', cols(hours, { small: true, every: 3 }), '조회수')}
      ${card('요일', cols(week, { small: true }), '조회수')}
      ${card('신규 · 재방문', `
        <div class="st-split" role="img" aria-label="신규 ${pct(s.new_uv, s.uv)}%, 재방문 ${retRate}%">
          <i style="flex:${s.new_uv || 0.0001}"></i><i style="flex:${returning || 0.0001}"></i></div>
        ${bars([{ name: '신규 방문자', n: s.new_uv }, { name: '재방문자', n: returning }].filter((r) => r.n))}`, '순방문자')}
      ${card('기기', bars(d.devices), '방문 횟수')}
      ${card('브라우저', bars(d.browsers), '방문 횟수')}
      ${card('운영체제', bars(d.oses), '방문 횟수')}
      ${card('나라', bars(countries), '방문 횟수')}
      ${card('검색어', bars(d.keywords), '검색 사이트가 알려 준 것만')}
    </div>

    <h2 class="st-h">콘텐츠 분석</h2>
    <div class="st-grid">
      ${card('인기 페이지', topPages, '', 'full')}
      ${card('처음 들어온 페이지', bars(d.entries), '방문 횟수')}
      ${card('분류별 조회수', bars(d.categories), '조회수')}
    </div>

    <p class="st-note">로그인한 관리자와 검색 로봇의 방문은 세지 않아요. 이름이나 IP 같은 개인정보 없이 무작위 번호로만 방문자를 구분해요.
      이전 기간은 같은 길이의 바로 앞 기간이에요(오늘은 어제 같은 시각까지와 비교). 검색어는 대부분의 검색 사이트가 알려 주지 않아서 일부만 보여요.</p>`;
}
