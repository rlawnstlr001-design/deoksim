// 덕심 — 최애 D-day 포카 + 덕질 가계부 + 결산 티켓
import * as db from './db.js?v=202610041102';
import {
  STICKS, GENRES, KINDS, CATS, catOf, kindOf, genreOf, today, ymd, annivState, ddayText, annivLabel, nearest,
  won, monthKey, monthSummary, newId, esc, inkOn,
} from './model.js?v=202610041102';
import { ticketImage } from './report.js?v=202610041102';
import { isApp, haptic, shareFile, pushWidget, scheduleAnniv, initNative, widgetCount } from './native.js?v=202610041102';
import { track } from './track.js?v=202610041102';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');

const S = {
  idols: [],
  annivs: [],
  expenses: [],
  settings: { budgets: {}, notify: null, widgetIdol: null, tipWidget: true },
  bookMonth: monthKey(today()),
  reportMode: 'month',
};
const idolById = (id) => S.idols.find((i) => i.id === id);
const annivsOf = (id) => S.annivs.filter((a) => a.idolId === id);
const sortedIdols = () => [...S.idols].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.createdAt - b.createdAt);

// ---------- 사진 (기기 안에서 줄여 Blob으로 보관) ----------
const photoUrls = new Map();
function photoUrl(idol) {
  if (!idol?.photo) return null;
  if (!photoUrls.has(idol.id)) photoUrls.set(idol.id, URL.createObjectURL(idol.photo));
  return photoUrls.get(idol.id);
}
function dropPhotoUrl(id) {
  const u = photoUrls.get(id);
  if (u) URL.revokeObjectURL(u);
  photoUrls.delete(id);
}
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file);
  const side = 720;
  const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * scale);
  cv.height = Math.round(bmp.height * scale);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.82));
}

// ---------- 알림·시트 ----------
let toastTimer;
function toast(msg, { action, onAction } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-act">${esc(action)}</button>` : ''}`;
  t.classList.add('on');
  if (action) t.querySelector('.toast-act').onclick = () => { t.classList.remove('on'); onAction?.(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), action ? 5000 : 2200);
}

let closeSheet = null;
function openSheet(html, { onClose, cls = '' } = {}) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-back"></div><section class="sheet ${cls}" role="dialog" aria-modal="true"><span class="grip" aria-hidden="true"></span>${html}</section>`;
  root.classList.add('on');
  const close = () => { root.classList.remove('on'); root.innerHTML = ''; closeSheet = null; onClose?.(); };
  closeSheet = close;
  root.querySelector('.sheet-back').addEventListener('click', close);
  const sheet = root.querySelector('.sheet');
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  return { sheet, close };
}

// ---------- 저장 후 공통 처리: 위젯·알림 갱신 ----------
function upcomingItems() {
  const out = [];
  for (const a of S.annivs) {
    const idol = idolById(a.idolId);
    if (!idol) continue;
    const st = annivState(a);
    if (st.days < 0) continue;
    out.push({ idolId: idol.id, name: idol.name, color: idol.color, label: annivLabel(a, st), target: st.target, days: st.days });
  }
  return out.sort((p, q) => p.days - q.days);
}

function syncOutside() {
  pushWidget({
    updated: Date.now(),
    pick: S.settings.widgetIdol,
    items: S.annivs.filter((a) => idolById(a.idolId)).map((a) => {
      const idol = idolById(a.idolId);
      return { idolId: idol.id, name: idol.name, color: idol.color, kind: a.kind, label: a.label?.trim() || kindOf(a.kind).name, date: a.date, yearly: !!a.yearly };
    }),
  });
  if (S.settings.notify) scheduleAnniv(upcomingItems());
}

const saveSettings = () => db.put('kv', S.settings, 'settings');

// ---------- 포카 (홀로그램 기울이기) ----------
function poca(idol, { big = false, extra = '' } = {}) {
  const near = nearest(annivsOf(idol.id));
  const url = photoUrl(idol);
  const spent = monthSummary(S.expenses.filter((e) => e.idolId === idol.id), monthKey(today())).total;
  return `<a class="poca${big ? ' big' : ''}" href="#/idol/${idol.id}" data-poca style="--c:${idol.color};--ink:${inkOn(idol.color)}">
    <span class="poca-img"${url ? ` style="background-image:url('${url}')"` : ''}>${url ? '' : `<b class="initial">${esc([...idol.name][0] ?? '?')}</b>`}</span>
    <span class="holo" aria-hidden="true"></span>
    ${!big && spent ? `<span class="poca-spent">${won(spent)}</span>` : ''}
    <span class="poca-foot">
      <span class="poca-name">${esc(idol.name)}</span>
      ${near ? `<span class="poca-dday"><small>${esc(annivLabel(near.a, near.st))}</small>${ddayText(near.st.days)}</span>` : '<span class="poca-dday"><small>기념일을 넣어 주세요</small></span>'}
    </span>
    ${extra}
  </a>`;
}

// 기울기 센서(없으면 손가락·마우스 위치)로 광택이 흐른다
let tiltBound = false;
function bindTilt() {
  const set = (x, y) => {
    document.querySelectorAll('[data-poca]').forEach((el) => {
      el.style.setProperty('--mx', `${x}%`);
      el.style.setProperty('--my', `${y}%`);
      el.style.setProperty('--rx', `${(y - 50) / -7}deg`);
      el.style.setProperty('--ry', `${(x - 50) / 7}deg`);
    });
  };
  if (tiltBound) return;
  tiltBound = true;
  window.addEventListener('deviceorientation', (e) => {
    if (e.beta == null) return;
    const x = Math.max(0, Math.min(100, 50 + (e.gamma ?? 0) * 1.6));
    const y = Math.max(0, Math.min(100, 50 + ((e.beta ?? 45) - 45) * 1.6));
    set(x, y);
  });
  view.addEventListener('pointermove', (e) => {
    const card = e.target.closest('[data-poca]');
    if (!card) return;
    const r = card.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
  });
}
// iOS 사파리는 기울기 센서 권한을 사용자 탭 안에서 물어야 한다
let tiltAsked = false;
document.addEventListener('click', () => {
  if (tiltAsked) return;
  tiltAsked = true;
  try { window.DeviceOrientationEvent?.requestPermission?.().catch(() => {}); } catch { /* 미지원 */ }
}, { once: false, capture: true });

// ---------- 홈 ----------
function renderHome() {
  const idols = sortedIdols();
  if (!idols.length) {
    view.innerHTML = `<section class="welcome">
      <div class="crowd" aria-hidden="true">${STICKS.slice(0, 7).map((s, i) => `<i style="--c:${s.hex};--d:${i * 0.17}s"></i>`).join('')}</div>
      <h1>내 최애의 D-day를<br>응원봉 색으로</h1>
      <p>아이돌·배우·뮤지컬·야구·애니 누구든. 생일·데뷔·공연 날짜를 넣으면 포카에 D-day가 뜨고, 티켓·굿즈·포카 지출은 덕질 가계부로 모입니다.</p>
      <button class="btn btn-glow" id="first-idol">첫 최애 등록하기</button>
      <p class="fine">모든 기록은 이 기기 안에만 저장돼요.</p>
    </section>`;
    $('#first-idol').onclick = () => idolForm();
    return;
  }
  const up = upcomingItems()[0];
  const tip = isApp && S.settings.tipWidget
    ? `<div class="tip"><b>홈 화면에 D-day 위젯 놓기</b><p>바탕화면 빈 곳을 길게 누르고 → 위젯 → <b>덕심</b>을 끌어다 놓으세요. 앱을 열지 않아도 매일 D-day가 바뀝니다.</p><button class="text-btn" id="tip-x">알겠어요</button></div>`
    : '';
  view.innerHTML = `<section class="home">
    ${up ? `<a class="next" href="#/idol/${up.idolId}" style="--c:${idolById(up.idolId).color}">
      <span class="next-k">다음 D-day</span>
      <span class="next-t">${esc(up.name)} · ${esc(up.label)}</span>
      <span class="next-d">${ddayText(up.days)}</span></a>` : ''}
    ${tip}
    <div class="grid">
      ${idols.map((i) => poca(i)).join('')}
      <button class="poca add" id="add-idol"><span>＋</span>최애 추가</button>
    </div>
  </section>`;
  $('#add-idol').onclick = () => idolForm();
  $('#tip-x')?.addEventListener('click', async () => { S.settings.tipWidget = false; await saveSettings(); $('.tip')?.remove(); });
  bindTilt();
}

// 종류 칩과 같은 이름이면(예: 생일) 대신 다가오는 날짜를 크게 보여 준다
function mainLabel(a, st) {
  const l = annivLabel(a, st);
  if (l !== kindOf(a.kind).name) return l;
  const [, m, d] = st.target.split('-').map(Number);
  return `${m}월 ${d}일`;
}

// ---------- 최애 상세 ----------
function renderIdol(id) {
  const idol = idolById(id);
  if (!idol) { location.hash = '#/'; return; }
  const list = annivsOf(id).map((a) => ({ a, st: annivState(a) })).sort((p, q) => {
    const pu = p.st.days >= 0, qu = q.st.days >= 0;
    if (pu !== qu) return pu ? -1 : 1;
    return pu ? p.st.days - q.st.days : q.st.days - p.st.days;
  });
  const mine = S.expenses.filter((e) => e.idolId === id).sort((p, q) => q.date.localeCompare(p.date) || q.createdAt - p.createdAt);
  const month = monthSummary(mine, monthKey(today())).total;
  const all = mine.reduce((s, e) => s + e.amount, 0);
  setGlow(idol.color);
  view.innerHTML = `<section class="idol" style="--c:${idol.color}">
    <a class="back" href="#/">‹ 최애</a>
    <div class="idol-hero">${poca(idol, { big: true })}</div>
    <p class="idol-meta">${esc(genreOf(idol.genre).name)}${idol.group ? ` · ${esc(idol.group)}` : ''}</p>
    <div class="idol-actions">
      <button class="btn" id="edit-idol">편집</button>
      <button class="btn btn-glow" id="spend-idol">지출 기록</button>
    </div>
    <h2 class="h">기념일 <button class="text-btn" id="add-anniv">＋ 추가</button></h2>
    <ul class="annivs">
      ${list.length ? list.map(({ a, st }) => `<li><button class="anniv" data-anniv="${a.id}">
        <span class="kind">${esc(kindOf(a.kind).name)}</span>
        <span class="alabel">${esc(mainLabel(a, st))}<small>${a.date.replaceAll('-', '.')}${a.yearly ? ' · 매년' : ''}</small></span>
        <span class="dd${st.days === 0 ? ' today' : st.days < 0 ? ' past' : ''}">${ddayText(st.days)}</span>
      </button></li>`).join('') : '<li class="none">생일·데뷔일·공연 날짜를 넣어 보세요</li>'}
    </ul>
    <h2 class="h">덕질 지출</h2>
    <div class="spend-row"><div><small>이번 달</small><b>${won(month)}</b></div><div><small>지금까지</small><b>${won(all)}</b></div></div>
    <ul class="ex-list">${mine.slice(0, 8).map(exRow).join('') || '<li class="none">아직 기록이 없어요</li>'}</ul>
  </section>`;
  $('#edit-idol').onclick = () => idolForm(idol);
  $('#spend-idol').onclick = () => expenseSheet({ idolId: id });
  $('#add-anniv').onclick = () => annivForm({ idolId: id });
  view.querySelectorAll('[data-anniv]').forEach((b) => b.addEventListener('click', () => annivForm(S.annivs.find((a) => a.id === b.dataset.anniv))));
  bindExRows();
  bindTilt();
}

// ---------- 최애 등록·편집 ----------
function idolForm(idol = null) {
  const isNew = !idol;
  const birthday = idol ? null : true;
  let color = idol?.color ?? STICKS[0].hex;
  let photo = idol?.photo ?? null;
  const { sheet, close } = openSheet(`
    <h2 class="sheet-title">${isNew ? '최애 등록' : '최애 편집'}</h2>
    <label class="field">이름<input id="f-name" maxlength="20" value="${esc(idol?.name ?? '')}" placeholder="예: 윤오, 김선호, 2번 타자" autocomplete="off"></label>
    <label class="field">팀·그룹·작품 <small>선택</small><input id="f-group" maxlength="24" value="${esc(idol?.group ?? '')}" autocomplete="off"></label>
    <div class="field">장르<div class="chips" id="f-genre">${GENRES.map((g) => `<button class="chip${(idol?.genre ?? 'kpop') === g.key ? ' on' : ''}" data-g="${g.key}">${g.name}</button>`).join('')}</div></div>
    <div class="field">응원봉 색<div class="sticks" id="f-color">${STICKS.map((s) => `<button class="sw${s.hex === color ? ' on' : ''}" data-c="${s.hex}" style="--c:${s.hex}" aria-label="${s.name}"></button>`).join('')}<label class="sw custom" aria-label="직접 고르기"><input type="color" id="f-custom" value="${color}"></label></div></div>
    <div class="field">사진 <small>이 기기에만 보관 · 공유 이미지에는 들어가지 않아요</small>
      <div class="photo-row"><label class="btn">사진 고르기<input type="file" id="f-photo" accept="image/*" hidden></label><button class="text-btn" id="f-nophoto" ${photo ? '' : 'hidden'}>사진 빼기</button><span id="f-photo-ok">${photo ? '사진 있음' : ''}</span></div></div>
    ${isNew ? '<label class="field">생일 <small>선택 · 매년 D-day</small><input type="date" id="f-bday"></label>' : ''}
    <button class="btn btn-glow btn-wide" id="f-save">${isNew ? '등록하기' : '저장'}</button>
    ${isNew ? '' : '<button class="text-btn danger" id="f-del">이 최애 지우기</button>'}`);
  sheet.querySelector('#f-genre').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    sheet.querySelectorAll('#f-genre .chip').forEach((x) => x.classList.toggle('on', x === b));
  });
  sheet.querySelector('#f-color').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    color = b.dataset.c;
    sheet.querySelectorAll('#f-color .sw').forEach((x) => x.classList.toggle('on', x === b));
  });
  sheet.querySelector('#f-custom').addEventListener('input', (e) => {
    color = e.target.value.toUpperCase();
    sheet.querySelectorAll('#f-color .sw').forEach((x) => x.classList.toggle('on', x.classList.contains('custom')));
  });
  sheet.querySelector('#f-photo').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { photo = await shrinkPhoto(f); sheet.querySelector('#f-photo-ok').textContent = '사진 있음'; sheet.querySelector('#f-nophoto').hidden = false; }
    catch { toast('사진을 읽지 못했어요'); }
  });
  sheet.querySelector('#f-nophoto').addEventListener('click', () => { photo = null; sheet.querySelector('#f-photo-ok').textContent = ''; sheet.querySelector('#f-nophoto').hidden = true; });
  sheet.querySelector('#f-save').addEventListener('click', async () => {
    const name = sheet.querySelector('#f-name').value.trim();
    if (!name) { toast('이름을 넣어 주세요'); return; }
    const genre = sheet.querySelector('#f-genre .chip.on')?.dataset.g ?? 'kpop';
    const rec = idol ?? { id: newId(), createdAt: Date.now(), sort: S.idols.length };
    Object.assign(rec, { name, group: sheet.querySelector('#f-group').value.trim(), genre, color, photo });
    dropPhotoUrl(rec.id);
    if (isNew) S.idols.push(rec);
    await db.put('idols', rec);
    if (isNew && birthday) {
      const bd = sheet.querySelector('#f-bday').value;
      if (bd) {
        const a = { id: newId(), idolId: rec.id, kind: 'birthday', label: '', date: bd, yearly: true };
        S.annivs.push(a);
        await db.put('annivs', a);
      }
    }
    if (isNew) track('idol_add');
    close();
    syncOutside();
    haptic('medium');
    if (isNew) { location.hash = `#/idol/${rec.id}`; toast(`${name} 등록 완료 💡`); } else render();
  });
  sheet.querySelector('#f-del')?.addEventListener('click', async () => {
    if (!confirm(`${idol.name}와(과) 기념일을 지울까요? 지출 기록은 남고 "최애 없음"으로 바뀝니다.`)) return;
    const ann = annivsOf(idol.id).map((a) => a.id);
    S.annivs = S.annivs.filter((a) => a.idolId !== idol.id);
    S.idols = S.idols.filter((i) => i.id !== idol.id);
    const changed = S.expenses.filter((e) => e.idolId === idol.id);
    changed.forEach((e) => { e.idolId = null; });
    await db.del('idols', idol.id);
    await db.delMany('annivs', ann);
    if (changed.length) await db.putMany('expenses', changed);
    dropPhotoUrl(idol.id);
    close();
    syncOutside();
    location.hash = '#/';
  });
  if (isNew) setTimeout(() => sheet.querySelector('#f-name').focus(), 80);
}

// ---------- 기념일 ----------
function annivForm(a) {
  const isNew = !a.id;
  const kind = a.kind ?? 'birthday';
  const { sheet, close } = openSheet(`
    <h2 class="sheet-title">${isNew ? '기념일 추가' : '기념일 편집'} <small>${esc(idolById(a.idolId)?.name ?? '')}</small></h2>
    <div class="field">종류<div class="chips" id="a-kind">${KINDS.map((k) => `<button class="chip${k.key === kind ? ' on' : ''}" data-k="${k.key}" data-y="${k.yearly}">${k.name}</button>`).join('')}</div></div>
    <label class="field">이름 <small>선택 · 비우면 종류 이름</small><input id="a-label" maxlength="24" value="${esc(a.label ?? '')}" placeholder="예: 서울 콘서트 막콘, 첫 팬미팅"></label>
    <label class="field">날짜<input type="date" id="a-date" value="${esc(a.date ?? today())}"></label>
    <label class="check"><input type="checkbox" id="a-yearly" ${(a.yearly ?? kindOf(kind).yearly) ? 'checked' : ''}> 매년 돌아오는 날</label>
    <button class="btn btn-glow btn-wide" id="a-save">${isNew ? '추가' : '저장'}</button>
    ${isNew ? '' : '<button class="text-btn danger" id="a-del">지우기</button>'}`);
  sheet.querySelector('#a-kind').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    sheet.querySelectorAll('#a-kind .chip').forEach((x) => x.classList.toggle('on', x === b));
    sheet.querySelector('#a-yearly').checked = b.dataset.y === 'true';
  });
  sheet.querySelector('#a-save').addEventListener('click', async () => {
    const date = sheet.querySelector('#a-date').value;
    if (!date) { toast('날짜를 골라 주세요'); return; }
    const rec = isNew ? { id: newId(), idolId: a.idolId } : a;
    Object.assign(rec, {
      kind: sheet.querySelector('#a-kind .chip.on').dataset.k,
      label: sheet.querySelector('#a-label').value.trim(),
      date,
      yearly: sheet.querySelector('#a-yearly').checked,
    });
    if (isNew) S.annivs.push(rec);
    await db.put('annivs', rec);
    close();
    syncOutside();
    render();
    if (isApp && S.settings.notify == null) askNotify();
  });
  sheet.querySelector('#a-del')?.addEventListener('click', async () => {
    S.annivs = S.annivs.filter((x) => x.id !== a.id);
    await db.del('annivs', a.id);
    close();
    syncOutside();
    render();
  });
}

function askNotify() {
  const { sheet, close } = openSheet(`
    <h2 class="sheet-title">D-day 알림 받을까요?</h2>
    <p class="sub">기념일 <b>30일 전·5일 전·하루 전·당일</b> 오전 10시에 알려 드려요.</p>
    <div class="row2"><button class="btn" id="n-no">괜찮아요</button><button class="btn btn-glow" id="n-yes">알림 받기</button></div>`);
  sheet.querySelector('#n-yes').onclick = async () => {
    const r = await scheduleAnniv(upcomingItems(), true);
    S.settings.notify = r === 'granted';
    await saveSettings();
    close();
    toast(S.settings.notify ? '기념일 알림을 켰어요' : '알림 권한이 없어 켜지 못했어요');
  };
  sheet.querySelector('#n-no').onclick = async () => { S.settings.notify = false; await saveSettings(); close(); };
}

// ---------- 지출 (티켓 스텁 입력) ----------
function exRow(e) {
  const idol = idolById(e.idolId);
  const c = catOf(e.category);
  return `<li><button class="ex" data-ex="${e.id}">
    <span class="ex-icon">${c.icon}</span>
    <span class="ex-body"><b>${esc(e.memo || c.name)}${e.category === 'photocard' && (e.qty || 1) > 1 ? ` ×${e.qty}` : ''}</b>
      <small>${idol ? `<i class="dot" style="--c:${idol.color}"></i>${esc(idol.name)} · ` : ''}${e.date.slice(5).replace('-', '.')}</small></span>
    <span class="ex-amt">${won(e.amount)}</span></button></li>`;
}
function bindExRows() {
  view.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => expenseSheet(S.expenses.find((x) => x.id === b.dataset.ex))));
}

function expenseSheet(init = {}) {
  const isNew = !init.id;
  let amount = String(init.amount ?? '');
  let cat = init.category ?? 'goods';
  let idolId = init.idolId ?? (S.idols.length === 1 ? S.idols[0].id : null);
  let qty = init.qty ?? 1;
  const idols = sortedIdols();
  const { sheet, close } = openSheet(`
    <div class="stub" id="stub">
      <div class="stub-top">
        <span class="admit">ADMIT ONE · ${isNew ? '덕질 기록' : '기록 고치기'}</span>
        <div class="amount" id="x-amt">0원</div>
      </div>
      <div class="perf" aria-hidden="true"></div>
      <div class="stub-body">
        <div class="cats" id="x-cat">${CATS.map((c) => `<button class="cat${c.key === cat ? ' on' : ''}" data-cat="${c.key}"><span>${c.icon}</span>${c.name}</button>`).join('')}</div>
        <div class="qty" id="x-qty" ${cat === 'photocard' ? '' : 'hidden'}>포카 <button data-q="-1">－</button><b id="x-qn">${qty}</b>장<button data-q="1">＋</button></div>
        ${idols.length ? `<div class="who" id="x-who">${idols.map((i) => `<button class="who-chip${i.id === idolId ? ' on' : ''}" data-i="${i.id}" style="--c:${i.color};--ink:${inkOn(i.color)}">${esc(i.name)}</button>`).join('')}<button class="who-chip${idolId ? '' : ' on'}" data-i="" style="--c:#8C86A8;--ink:#fff">함께·기타</button></div>` : ''}
        <div class="row2"><input type="date" id="x-date" value="${esc(init.date ?? today())}"><input id="x-memo" maxlength="30" placeholder="메모 (예: 팬콘 티켓)" value="${esc(init.memo ?? '')}"></div>
        <div class="pad" id="x-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div>
        <button class="btn btn-glow btn-wide" id="x-save">${isNew ? '기록하기' : '저장'}</button>
        ${isNew ? '' : '<button class="text-btn danger" id="x-del">이 기록 지우기</button>'}
      </div>
    </div>`, { cls: 'ticket-sheet' });
  const drawAmt = () => { sheet.querySelector('#x-amt').textContent = won(Number(amount || 0)); };
  drawAmt();
  sheet.querySelector('#x-pad').addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
    if (k === '⌫') amount = amount.slice(0, -1);
    else if (amount.length < 9) amount = (amount + k).replace(/^0+/, '');
    haptic();
    drawAmt();
  });
  sheet.querySelector('#x-cat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    cat = b.dataset.cat;
    sheet.querySelectorAll('#x-cat .cat').forEach((x) => x.classList.toggle('on', x === b));
    sheet.querySelector('#x-qty').hidden = cat !== 'photocard';
  });
  sheet.querySelector('#x-qty').addEventListener('click', (e) => {
    const d = Number(e.target.closest('[data-q]')?.dataset.q ?? 0); if (!d) return;
    qty = Math.max(1, Math.min(99, qty + d));
    sheet.querySelector('#x-qn').textContent = qty;
  });
  sheet.querySelector('#x-who')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    idolId = b.dataset.i || null;
    sheet.querySelectorAll('#x-who .who-chip').forEach((x) => x.classList.toggle('on', x === b));
  });
  sheet.querySelector('#x-save').addEventListener('click', async () => {
    const n = Number(amount || 0);
    if (!n) { toast('금액을 눌러 주세요'); return; }
    const rec = isNew ? { id: newId(), createdAt: Date.now() } : init;
    Object.assign(rec, {
      amount: n, category: cat, idolId, date: sheet.querySelector('#x-date').value || today(),
      memo: sheet.querySelector('#x-memo').value.trim(), qty: cat === 'photocard' ? qty : 1,
    });
    if (isNew) S.expenses.push(rec);
    await db.put('expenses', rec);
    if (isNew) track('expense');
    haptic('medium');
    // 절취선을 따라 위 조각이 뜯겨 나간다
    sheet.querySelector('#stub').classList.add('torn');
    setTimeout(() => { close(); render(); toast(isNew ? `${won(n)} 기록했어요` : '고쳤어요'); }, 520);
  });
  sheet.querySelector('#x-del')?.addEventListener('click', async () => {
    S.expenses = S.expenses.filter((x) => x.id !== init.id);
    await db.del('expenses', init.id);
    close();
    render();
    toast('지웠어요', {
      action: '되돌리기',
      onAction: async () => { S.expenses.push(init); await db.put('expenses', init); render(); },
    });
  });
}

// ---------- 가계부 ----------
function shiftMonth(m, d) {
  const [y, mm] = m.split('-').map(Number);
  return ymd(new Date(y, mm - 1 + d, 1)).slice(0, 7);
}
function renderBook() {
  const m = S.bookMonth;
  const sum = monthSummary(S.expenses, m);
  const budget = S.settings.budgets[m] ?? S.settings.budgets.default ?? 0;
  const pct = budget ? Math.min(100, Math.round((sum.total / budget) * 100)) : 0;
  const byDate = new Map();
  [...sum.list].sort((p, q) => q.date.localeCompare(p.date) || q.createdAt - p.createdAt).forEach((e) => {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  });
  const [y, mm] = m.split('-').map(Number);
  view.innerHTML = `<section class="book">
    <div class="mhead"><button class="icon-btn" id="m-prev" aria-label="이전 달">‹</button><h2>${y}년 ${mm}월</h2><button class="icon-btn" id="m-next" aria-label="다음 달" ${m >= monthKey(today()) ? 'disabled' : ''}>›</button></div>
    <div class="total"><small>이번 달 덕질비</small><b>${won(sum.total)}</b></div>
    <button class="budget" id="budget">${budget
      ? `<span class="bar"><i style="width:${pct}%" class="${sum.total > budget ? 'over' : ''}"></i></span><span>예산 ${won(budget)} · ${sum.total > budget ? `${won(sum.total - budget)} 넘음` : `${won(budget - sum.total)} 남음`}</span>`
      : '<span>＋ 이번 달 예산 정하기</span>'}</button>
    <div class="catsum">${CATS.filter((c) => sum.byCat.get(c.key)).map((c) => `<span>${c.icon} ${c.name} <b>${won(sum.byCat.get(c.key))}</b></span>`).join('') || ''}</div>
    ${[...byDate.entries()].map(([d, list]) => `<h3 class="dayh">${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일</h3><ul class="ex-list">${list.map(exRow).join('')}</ul>`).join('') || '<p class="none">이 달의 기록이 없어요. 아래 ＋ 기록으로 시작해 보세요.</p>'}
  </section>`;
  $('#m-prev').onclick = () => { S.bookMonth = shiftMonth(m, -1); renderBook(); };
  $('#m-next').onclick = () => { S.bookMonth = shiftMonth(m, 1); renderBook(); };
  $('#budget').onclick = async () => {
    const v = prompt('이번 달 덕질 예산 (원)', budget || '');
    if (v == null) return;
    const n = Number(String(v).replace(/[^\d]/g, ''));
    S.settings.budgets[m] = n;
    if (n) S.settings.budgets.default = n; // 다음 달도 같은 예산으로 시작
    await saveSettings();
    renderBook();
  };
  bindExRows();
}

// ---------- 결산 ----------
function reportData() {
  const t = today();
  const isYear = S.reportMode === 'year';
  const y = t.slice(0, 4);
  const m = monthKey(t);
  const list = S.expenses.filter((e) => (isYear ? e.date.startsWith(y) : monthKey(e.date) === m));
  const total = list.reduce((s, e) => s + e.amount, 0);
  const byIdol = new Map();
  const byCat = new Map();
  list.forEach((e) => {
    byIdol.set(e.idolId ?? '__none', (byIdol.get(e.idolId ?? '__none') ?? 0) + e.amount);
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  });
  const rows = [...byIdol.entries()].sort((a, b) => b[1] - a[1]).map(([id, amount]) => {
    const idol = idolById(id);
    return { name: idol?.name ?? '함께·기타', color: idol?.color ?? '#8C86A8', amount };
  });
  const topCatKey = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const budget = isYear ? 0 : (S.settings.budgets[m] ?? S.settings.budgets.default ?? 0);
  return {
    title: isYear ? `${y} 덕질 투어` : `${Number(m.slice(5))}월의 덕질`,
    period: isYear ? `${y}.01 – ${y}.12` : `${y}.${m.slice(5)} 결산`,
    total, rows, budget,
    tickets: list.filter((e) => e.category === 'ticket').length,
    photocards: list.filter((e) => e.category === 'photocard').reduce((s, e) => s + (e.qty || 1), 0),
    topCat: topCatKey ? catOf(topCatKey).name : '',
  };
}
function renderReport() {
  const r = reportData();
  const max = Math.max(1, ...r.rows.map((x) => x.amount));
  view.innerHTML = `<section class="report">
    <div class="seg"><button data-mode="month" class="${S.reportMode === 'month' ? 'on' : ''}">이번 달</button><button data-mode="year" class="${S.reportMode === 'year' ? 'on' : ''}">올해</button></div>
    <article class="ticket">
      <div class="t-top">
        <span class="admit">ADMIT ONE · 덕심</span>
        <h2>${esc(r.title)}</h2>
        <p class="period">${esc(r.period)}</p>
        <div class="t-total">${won(r.total)}</div>
        <dl class="t-stats"><div><dt>공연·티켓</dt><dd>${r.tickets}회</dd></div><div><dt>포카</dt><dd>${r.photocards}장</dd></div><div><dt>가장 많이</dt><dd>${esc(r.topCat || '—')}</dd></div></dl>
        <ul class="t-bars">${r.rows.slice(0, 4).map((x) => `<li><span>${esc(x.name)}</span><i style="--c:${x.color};--w:${Math.max(6, (x.amount / max) * 100)}%"></i><b>${won(x.amount)}</b></li>`).join('') || '<li class="none">기록이 쌓이면 최애별 막대가 생겨요</li>'}</ul>
      </div>
      <div class="perf" aria-hidden="true"></div>
      <div class="t-bottom"><span>${r.budget ? `예산 ${won(r.budget)} 중 ${Math.round((r.total / r.budget) * 100)}%` : '이번 시즌도 수고했어요'}</span><span class="barcode" aria-hidden="true"></span></div>
    </article>
    <button class="btn btn-glow btn-wide" id="r-share" ${r.total ? '' : 'disabled'}>결산 티켓 이미지로 공유</button>
    <p class="fine">공유 이미지에는 사진이 들어가지 않아요. 이름·색·금액만.</p>
  </section>`;
  view.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    S.reportMode = b.dataset.mode;
    renderReport();
  });
  $('#r-share').onclick = async () => {
    const blob = await ticketImage(r);
    const name = `deoksim-${S.reportMode}-${today()}.png`;
    track('report_share');
    if (isApp) { await shareFile(blob, name, r.title); return; }
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: r.title }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('이미지를 저장했어요');
  };
}

// ---------- 설정·내보내기 ----------
function download(name, text, type) {
  const blob = new Blob([text], { type });
  if (isApp) { shareFile(blob, name, '덕심 내보내기'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function exportJson() {
  const idols = S.idols.map(({ photo, ...rest }) => rest); // 사진은 백업에서 뺀다 (용량·초상권)
  download(`deoksim-${today()}.json`, JSON.stringify({ app: 'deoksim', version: 1, exportedAt: new Date().toISOString(), idols, annivs: S.annivs, expenses: S.expenses, settings: S.settings }, null, 2), 'application/json');
}
function exportCsv() {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = ['날짜,최애,분류,금액,수량,메모', ...[...S.expenses].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date, q(idolById(e.idolId)?.name ?? ''), q(catOf(e.category).name), e.amount, e.qty || 1, q(e.memo)].join(','))];
  download(`deoksim-expenses-${today()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
}
async function importJson(file) {
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'deoksim') throw new Error();
    const add = (store, arr, list) => arr.filter((x) => x?.id && !list.some((y) => y.id === x.id));
    const ni = add('idols', d.idols ?? [], S.idols); const na = add('annivs', d.annivs ?? [], S.annivs); const ne = add('expenses', d.expenses ?? [], S.expenses);
    S.idols.push(...ni); S.annivs.push(...na); S.expenses.push(...ne);
    if (ni.length) await db.putMany('idols', ni);
    if (na.length) await db.putMany('annivs', na);
    if (ne.length) await db.putMany('expenses', ne);
    syncOutside();
    render();
    toast(`최애 ${ni.length} · 기념일 ${na.length} · 기록 ${ne.length}개를 가져왔어요`);
  } catch { toast('덕심 백업 파일이 아니에요'); }
}
function showSettings() {
  const { sheet } = openSheet(`
    <h2 class="sheet-title">설정</h2>
    ${isApp ? `<div class="set">
      <label class="check"><input type="checkbox" id="s-notify" ${S.settings.notify ? 'checked' : ''}> 기념일 알림 (D-30·5·1·당일 오전 10시)</label>
      <label class="field">위젯에 띄울 최애<select id="s-widget"><option value="">가장 가까운 D-day 자동</option>${sortedIdols().map((i) => `<option value="${i.id}" ${S.settings.widgetIdol === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label>
      <p class="sub">위젯 놓기: 바탕화면 빈 곳 길게 누르기 → 위젯 → 덕심</p></div>` : `<p class="sub">앱을 설치하면 홈 화면 D-day 위젯과 기념일 알림을 쓸 수 있어요.</p>`}
    <h3 class="set-h">내 기록 꺼내 가기</h3>
    <div class="row2"><button class="btn" id="s-csv">지출 표(CSV)</button><button class="btn" id="s-json">백업 파일(JSON)</button></div>
    <label class="btn btn-wide file">백업 파일 가져오기<input type="file" id="s-import" accept="application/json,.json" hidden></label>
    <p class="sub">기록은 이 기기 안에만 저장돼요. 폰을 바꾸기 전에 백업 파일을 받아 두세요. (사진은 백업에 들어가지 않아요)</p>
    <p class="fine"><a href="privacy.html">개인정보처리방침</a> · 버전 ${esc(window.APP_VERSION ?? 'web')}</p>`);
  sheet.querySelector('#s-notify')?.addEventListener('change', async (e) => {
    if (e.target.checked) {
      const r = await scheduleAnniv(upcomingItems(), true);
      S.settings.notify = r === 'granted';
      if (!S.settings.notify) { e.target.checked = false; toast('알림 권한이 필요해요 (휴대폰 설정 → 앱 → 덕심 → 알림)'); }
    } else { S.settings.notify = false; await scheduleAnniv([], false); }
    await saveSettings();
  });
  sheet.querySelector('#s-widget')?.addEventListener('change', async (e) => { S.settings.widgetIdol = e.target.value || null; await saveSettings(); syncOutside(); toast('위젯에 반영했어요'); });
  sheet.querySelector('#s-csv').onclick = exportCsv;
  sheet.querySelector('#s-json').onclick = exportJson;
  sheet.querySelector('#s-import').onchange = (e) => e.target.files[0] && importJson(e.target.files[0]);
}
$('#btn-settings').addEventListener('click', showSettings);
$('#fab').addEventListener('click', () => {
  const m = location.hash.match(/^#\/idol\/(.+)$/);
  expenseSheet(m ? { idolId: m[1] } : {});
});

// 화면 강조색 = 응원봉 색. 밝은 색이면 글자를 어둡게
function setGlow(hex) {
  document.documentElement.style.setProperty('--glow', hex);
  document.documentElement.style.setProperty('--glow-ink', inkOn(hex));
}

// ---------- 라우터 ----------
function currentTab() {
  const h = location.hash || '#/';
  if (h.startsWith('#/book')) return 'book';
  if (h.startsWith('#/report')) return 'report';
  return 'home';
}
function render() {
  const h = location.hash || '#/';
  const tab = currentTab();
  document.body.dataset.tab = tab;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  // 브랜드 응원봉은 가장 가까운 최애 색으로 빛난다
  const up = upcomingItems()[0];
  setGlow(up ? idolById(up.idolId).color : STICKS[1].hex);
  const m = h.match(/^#\/idol\/(.+)$/);
  document.body.dataset.route = m ? 'idol' : tab;
  if (m) renderIdol(m[1]);
  else if (tab === 'book') renderBook();
  else if (tab === 'report') renderReport();
  else renderHome();
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

async function init() {
  const [idols, annivs, expenses, settings] = await Promise.all([db.getAll('idols'), db.getAll('annivs'), db.getAll('expenses'), db.get('kv', 'settings')]);
  Object.assign(S, { idols, annivs, expenses });
  if (settings) S.settings = { ...S.settings, ...settings, budgets: settings.budgets ?? {} };
  initNative({
    onBack: () => {
      if (closeSheet) { closeSheet(); return true; }
      if ((location.hash || '#/') !== '#/') { history.length > 1 ? history.back() : (location.hash = '#/'); return true; }
      return false;
    },
    onOpenHash: (h) => { location.hash = h; },
  });
  render();
  syncOutside();
  track('visit');
  // 위젯을 이미 놓았으면 안내를 거두고 지표에 남긴다
  widgetCount().then(async (n) => {
    if (!n) return;
    track('widget_on');
    if (S.settings.tipWidget) { S.settings.tipWidget = false; await saveSettings(); $('.tip')?.remove(); }
  });
  db.askPersist();
}
init();
