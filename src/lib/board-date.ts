// 게시판 날짜: 오늘 쓴 글은 시각, 그 밖에는 날짜 (한국 시간)
const day = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
const ymd = (d: Date) => day.format(d).replace(/\s/g, '').replace(/\.$/, '');
export const bdShort = (d: Date) => (ymd(d) === ymd(new Date()) ? time.format(d) : ymd(d));
export const bdFull = (d: Date) => `${ymd(d)} ${time.format(d)}`;
