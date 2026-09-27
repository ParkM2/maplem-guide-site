// 방문 기록을 사람이 읽을 수 있는 분류로 바꿉니다. IP 같은 개인정보는 저장하지 않습니다.

export const isBot = (ua: string) =>
  !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|node-fetch|go-http/i.test(ua);

export function device(ua: string) {
  if (/iPad|Tablet|SM-T|Tab(?!le)/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return '태블릿';
  if (/Mobi|iPhone|Android/i.test(ua)) return '모바일';
  return 'PC';
}

export function browser(ua: string) {
  if (/KAKAOTALK/i.test(ua)) return '카카오톡 앱';
  if (/NAVER\(inapp/i.test(ua)) return '네이버 앱';
  if (/Whale/i.test(ua)) return '웨일';
  if (/SamsungBrowser/i.test(ua)) return '삼성 인터넷';
  if (/Edg\//i.test(ua)) return '엣지';
  if (/OPR\/|Opera/i.test(ua)) return '오페라';
  if (/Firefox|FxiOS/i.test(ua)) return '파이어폭스';
  if (/Chrome|CriOS/i.test(ua)) return '크롬';
  if (/Safari/i.test(ua)) return '사파리';
  return '기타';
}

export function os(ua: string) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return '안드로이드';
  if (/Windows/i.test(ua)) return '윈도우';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/CrOS/i.test(ua)) return '크롬 OS';
  if (/Linux/i.test(ua)) return '리눅스';
  return '기타';
}

const SOURCES: [RegExp, string][] = [
  [/(^|\.)search\.naver\.com$/, '네이버 검색'],
  [/(^|\.)blog\.naver\.com$/, '네이버 블로그'],
  [/(^|\.)cafe\.naver\.com$/, '네이버 카페'],
  [/(^|\.)naver\.com$/, '네이버 기타'],
  [/(^|\.)google\.[a-z.]+$/, '구글 검색'],
  [/(^|\.)(search\.daum\.net|daum\.net)$/, '다음'],
  [/(^|\.)bing\.com$/, '빙 검색'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, '유튜브'],
  [/(^|\.)(kakao\.com|kakaocdn\.net)$/, '카카오'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X(트위터)'],
  [/(^|\.)(facebook\.com|instagram\.com|threads\.net)$/, '메타(페북·인스타)'],
  [/(^|\.)dcinside\.com$/, '디시인사이드'],
  [/(^|\.)inven\.co\.kr$/, '인벤'],
  [/(^|\.)arca\.live$/, '아카라이브'],
  [/(^|\.)(discord\.com|discord\.gg)$/, '디스코드'],
];

export function classifyReferrer(ref: string, selfHost: string, utm: string | null) {
  if (utm) return { source: utm.slice(0, 40), refHost: null, keyword: null };
  if (!ref) return { source: '직접 방문', refHost: null, keyword: null };
  let u: URL;
  try {
    u = new URL(ref);
  } catch {
    return { source: '기타 사이트', refHost: null, keyword: null };
  }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (host === selfHost.replace(/^www\./, '')) return { source: '내부 이동', refHost: null, keyword: null };
  const keyword = (u.searchParams.get('query') || u.searchParams.get('q') || u.searchParams.get('wd') || '').trim().slice(0, 80) || null;
  const hit = SOURCES.find(([re]) => re.test(host));
  return { source: hit ? hit[1] : '기타 사이트', refHost: host.slice(0, 100), keyword };
}
