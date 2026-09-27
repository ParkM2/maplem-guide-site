// 브라우저 안 검색: 띄어쓰기로 나눈 모든 낱말이 들어 있는 글을 찾고, 제목에 맞으면 위로 올립니다.
type Doc = { t: string; u: string; c: string; s: string; g: string[]; b: string };
export type Hit = Doc & { score: number; snip: string };

let docs: Promise<Doc[]> | null = null;
const load = () => (docs ??= fetch('/search.json').then((r) => r.json()));
const norm = (s: string) => s.toLowerCase().normalize('NFC');

export async function search(query: string): Promise<Hit[]> {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: Hit[] = [];
  for (const d of await load()) {
    const title = norm(d.t), meta = norm(`${d.c} ${d.s} ${d.g.join(' ')}`), body = norm(d.b);
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const inTitle = title.includes(t), inMeta = meta.includes(t), inBody = body.includes(t);
      if (!inTitle && !inMeta && !inBody) { ok = false; break; }
      score += (inTitle ? 10 : 0) + (inMeta ? 4 : 0) + (inBody ? 1 : 0);
    }
    if (!ok) continue;
    const at = body.indexOf(terms[0]);
    const snip = at < 0 ? d.s || d.b.slice(0, 90) : (at > 30 ? '…' : '') + d.b.slice(Math.max(0, at - 30), at + 70) + '…';
    hits.push({ ...d, score, snip });
  }
  return hits.sort((a, b) => b.score - a.score);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export function mark(text: string, query: string) {
  let out = esc(text);
  for (const t of query.split(/\s+/).filter(Boolean)) {
    const re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, (m) => `<mark>${m}</mark>`);
  }
  return out;
}

export function renderHits(hits: Hit[], q: string) {
  return `<ul class="hits">${hits
    .map((h) => `<li><a href="${esc(h.u)}"><b>${mark(h.t, q)}</b><span class="where">${esc(h.c)}</span><span class="snip">${mark(h.snip, q)}</span></a></li>`)
    .join('')}</ul>`;
}
