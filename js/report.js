// 덕질 결산 티켓 이미지 (1080×1920, 인스타 스토리 비율). 사진은 넣지 않는다 — 이름·색·숫자만.
import { won } from './model.js?v=202610041102';

const BG = '#12102A';
const PAPER = '#F7F3FF';
const INK = '#1A1530';
const SUB = '#6B6488';

export async function ticketImage({ title, period, total, tickets, photocards, rows, topCat, budget }) {
  const W = 1080, H = 1920;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  try { await document.fonts.load('48px "Black Han Sans"'); } catch { /* 폰트 없음 */ }
  const display = '"Black Han Sans", "Malgun Gothic", sans-serif';
  const body = '-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

  // 공연장 바탕 + 응원봉 빛 번짐
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  rows.slice(0, 4).forEach((r, i) => {
    const gr = g.createRadialGradient(180 + i * 240, 230 + (i % 2) * 90, 10, 180 + i * 240, 230 + (i % 2) * 90, 260);
    gr.addColorStop(0, r.color + 'AA'); gr.addColorStop(1, r.color + '00');
    g.fillStyle = gr; g.fillRect(0, 0, W, 700);
  });

  // 티켓 몸통
  const x = 90, y = 300, w = W - 180, h = 1300, notchY = y + 860;
  g.fillStyle = PAPER;
  g.beginPath(); g.roundRect(x, y, w, h, 36); g.fill();
  // 양옆 반달 홈 = 바탕색 원으로 파낸다
  g.fillStyle = BG;
  for (const cx of [x, x + w]) { g.beginPath(); g.arc(cx, notchY, 40, 0, Math.PI * 2); g.fill(); }
  // 절취선
  g.strokeStyle = '#C9C1E6'; g.lineWidth = 4; g.setLineDash([16, 14]);
  g.beginPath(); g.moveTo(x + 56, notchY); g.lineTo(x + w - 56, notchY); g.stroke(); g.setLineDash([]);

  g.fillStyle = SUB; g.font = `600 34px ${body}`;
  g.fillText('ADMIT ONE · 덕심', x + 60, y + 90);
  g.fillStyle = INK; g.font = `72px ${display}`;
  g.fillText(title, x + 60, y + 190);
  g.fillStyle = SUB; g.font = `500 36px ${body}`;
  g.fillText(period, x + 60, y + 245);

  g.fillStyle = INK; g.font = `120px ${display}`;
  g.fillText(won(total), x + 60, y + 400);

  // 숫자 세 칸
  const stats = [['공연·티켓', `${tickets}회`], ['포카', `${photocards}장`], ['가장 많이', topCat || '—']];
  stats.forEach(([k, v], i) => {
    const cx = x + 60 + i * 300;
    g.fillStyle = SUB; g.font = `500 30px ${body}`; g.fillText(k, cx, y + 480);
    g.fillStyle = INK; g.font = `52px ${display}`; g.fillText(v, cx, y + 545);
  });

  // 최애별 막대 (응원봉 색)
  const max = Math.max(1, ...rows.map((r) => r.amount));
  rows.slice(0, 3).forEach((r, i) => {
    const by = y + 640 + i * 62;
    g.fillStyle = '#E6E0F7'; g.beginPath(); g.roundRect(x + 260, by - 24, w - 340, 28, 14); g.fill();
    g.fillStyle = r.color; g.beginPath(); g.roundRect(x + 260, by - 24, Math.max(28, (w - 340) * (r.amount / max)), 28, 14); g.fill();
    g.fillStyle = INK; g.font = `600 30px ${body}`;
    g.fillText(r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name, x + 60, by);
  });

  // 아래 조각: 예산·바코드
  g.fillStyle = SUB; g.font = `500 32px ${body}`;
  g.fillText(budget ? `예산 ${won(budget)} 중 ${Math.round((total / budget) * 100)}% 사용` : '이번 시즌도 수고했어요', x + 60, notchY + 110);
  for (let i = 0; i < 46; i++) {
    const bw = [3, 6, 2, 4][(i * 7) % 4];
    g.fillStyle = INK; g.fillRect(x + 60 + i * 13, notchY + 170, bw, 120);
  }
  g.fillStyle = SUB; g.font = `500 28px ${body}`;
  g.fillText('덕심 · 최애 D-day와 덕질 가계부', x + 60, notchY + 380);

  g.fillStyle = '#FFFFFF'; g.font = `44px ${display}`;
  g.fillText('오늘도 덕심 충전 완료 💡', 90, H - 120);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}
