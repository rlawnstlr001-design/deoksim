// 덕심 규칙 — 응원봉 색, 장르, 기념일 D-day, 지출 분류, 돈 표기
export const STICKS = [
  { name: '핑크', hex: '#FF4FA3' }, { name: '퍼플', hex: '#A66CFF' }, { name: '스카이', hex: '#4FC3FF' },
  { name: '민트', hex: '#3DDC97' }, { name: '옐로', hex: '#FFD23F' }, { name: '오렌지', hex: '#FF7A45' },
  { name: '레드', hex: '#FF3B5C' }, { name: '블루', hex: '#5B7CFF' }, { name: '화이트', hex: '#F2F2F2' },
  { name: '라임', hex: '#B8F45A' }, { name: '라벤더', hex: '#C9A0FF' }, { name: '청록', hex: '#2EE6D6' },
];

export const GENRES = [
  { key: 'kpop', name: '아이돌' }, { key: 'actor', name: '배우' }, { key: 'musical', name: '뮤지컬' },
  { key: 'sports', name: '스포츠' }, { key: 'anime', name: '애니' }, { key: 'game', name: '게임' }, { key: 'other', name: '기타' },
];

export const KINDS = [
  { key: 'birthday', name: '생일', yearly: true },
  { key: 'debut', name: '데뷔', yearly: true },
  { key: 'comeback', name: '컴백', yearly: false },
  { key: 'concert', name: '공연', yearly: false },
  { key: 'custom', name: '기념일', yearly: false },
];

export const CATS = [
  { key: 'ticket', name: '티켓', icon: '🎫' },
  { key: 'goods', name: '앨범·굿즈', icon: '💿' },
  { key: 'photocard', name: '포카', icon: '🃏' },
  { key: 'food', name: '카페·식비', icon: '🥤' },
  { key: 'transport', name: '교통·숙박', icon: '🚄' },
  { key: 'other', name: '기타', icon: '✨' },
];
export const catOf = (k) => CATS.find((c) => c.key === k) ?? CATS[5];
export const kindOf = (k) => KINDS.find((c) => c.key === k) ?? KINDS[4];
export const genreOf = (k) => GENRES.find((g) => g.key === k) ?? GENRES[6];

// ---- 날짜 (기기 현지 시간, 'YYYY-MM-DD') ----
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
const utc = ({ y, m, d }) => Date.UTC(y, m - 1, d);
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysBetween = (a, b) => Math.round((utc(parse(b)) - utc(parse(a))) / 86400000);

// 매년 돌아오는 날의 다음 차례 (2/29는 평년엔 2/28로)
export function nextOccurrence(dateStr, from = today()) {
  const { m, d } = parse(dateStr);
  const f = parse(from);
  const fix = (y) => (m === 2 && d === 29 && !isLeap(y) ? 28 : d);
  let y = f.y;
  let cand = `${y}-${pad(m)}-${pad(fix(y))}`;
  if (daysBetween(from, cand) < 0) { y += 1; cand = `${y}-${pad(m)}-${pad(fix(y))}`; }
  return cand;
}

// 기념일 하나의 지금 상태: { days(남은 날, 0=오늘, 음수=지난), target, nth(몇 주년/몇 번째 생일) }
export function annivState(a, from = today()) {
  if (a.yearly) {
    const target = nextOccurrence(a.date, from);
    const nth = parse(target).y - parse(a.date).y;
    return { days: daysBetween(from, target), target, nth, yearly: true };
  }
  return { days: daysBetween(from, a.date), target: a.date, nth: null, yearly: false };
}

export function ddayText(days) {
  if (days === 0) return 'D-DAY';
  if (days > 0) return `D-${days}`;
  return `+${(-days).toLocaleString('ko-KR')}일`;
}

export function annivLabel(a, st) {
  const k = kindOf(a.kind);
  const base = a.label?.trim() || k.name;
  if (st.yearly && st.nth > 0 && a.kind === 'debut') return `${base} ${st.nth}주년`;
  return base;
}

// 최애 한 명의 가장 가까운 다가오는 기념일 (없으면 가장 최근 지난 것)
export function nearest(annivs, from = today()) {
  const list = annivs.map((a) => ({ a, st: annivState(a, from) }));
  const up = list.filter((x) => x.st.days >= 0).sort((p, q) => p.st.days - q.st.days);
  if (up.length) return up[0];
  return list.sort((p, q) => q.st.days - p.st.days)[0] ?? null;
}

// ---- 돈 ----
export const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
export const monthKey = (dateStr) => dateStr.slice(0, 7);

export function monthSummary(expenses, month) {
  const list = expenses.filter((e) => monthKey(e.date) === month);
  const total = list.reduce((s, e) => s + e.amount, 0);
  const byCat = new Map();
  const byIdol = new Map();
  for (const e of list) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
    const k = e.idolId ?? '__none';
    byIdol.set(k, (byIdol.get(k) ?? 0) + e.amount);
  }
  return {
    list, total, byCat, byIdol,
    tickets: list.filter((e) => e.category === 'ticket').length,
    photocards: list.filter((e) => e.category === 'photocard').reduce((s, e) => s + (e.qty || 1), 0),
  };
}

export const newId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 밝은 응원봉 색(화이트·옐로·라임) 위 글자는 어둡게
export function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#1A1530' : '#FFFFFF';
}
