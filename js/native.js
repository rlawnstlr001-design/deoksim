// 앱(Capacitor) 안에서만 쓰는 기능. 웹에서는 isApp=false라 모두 건너뛰거나 웹 방식으로 대신한다.
const C = window.Capacitor;
export const isApp = !!C?.isNativePlatform?.();
export const platform = isApp ? C.getPlatform() : 'web';

const plug = (name) => (isApp ? C.registerPlugin(name) : null);
const App = plug('App');
const Haptics = plug('Haptics');
const StatusBar = plug('StatusBar');
const Share = plug('Share');
const Filesystem = plug('Filesystem');
const Notify = plug('LocalNotifications');
const Preferences = plug('Preferences');
const WidgetBridge = plug('WidgetBridge'); // MainActivity에 등록한 앱 내장 플러그인 (안드로이드)

export function haptic(kind = 'light') {
  if (!isApp) { try { navigator.vibrate?.(kind === 'light' ? 12 : 30); } catch { /* 미지원 */ } return; }
  if (platform === 'ios') Haptics.impact({ style: kind === 'light' ? 'LIGHT' : 'MEDIUM' }).catch(() => {});
  else Haptics.vibrate({ duration: kind === 'light' ? 14 : 35 }).catch(() => {});
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

export async function shareFile(blob, name, title) {
  if (!isApp) return false;
  try {
    const { uri } = await Filesystem.writeFile({ path: name, data: await blobToBase64(blob), directory: 'CACHE' });
    await Share.share({ title, files: [uri], dialogTitle: title });
  } catch { /* 닫음 */ }
  return true;
}

// ---- 홈 화면 위젯 ----
// Preferences 플러그인은 안드로이드 SharedPreferences("CapacitorStorage")에 쓴다 → 위젯이 같은 곳을 읽는다.
// D-day는 위젯이 날짜로 직접 계산하므로 앱을 열지 않아도 매일 맞게 바뀐다.
export async function pushWidget(payload) {
  if (!isApp) return;
  try {
    await Preferences.set({ key: 'deoksim_widget', value: JSON.stringify(payload) });
    await WidgetBridge?.refresh?.().catch(() => {});
  } catch { /* 위젯 없음 */ }
}

// ---- 기념일 알림 (D-30·D-5·D-1·당일 오전 10시) ----
const NOTI_BASE = 51000;
export async function scheduleAnniv(items, ask = false) {
  if (!isApp) return 'unsupported';
  try {
    let p = await Notify.checkPermissions();
    if (p.display !== 'granted' && ask) p = await Notify.requestPermissions();
    const pending = await Notify.getPending().catch(() => ({ notifications: [] }));
    const mine = pending.notifications.filter((x) => x.id >= NOTI_BASE && x.id < NOTI_BASE + 1000).map((x) => ({ id: x.id }));
    if (mine.length) await Notify.cancel({ notifications: mine });
    if (p.display !== 'granted') return p.display;
    if (platform === 'android') {
      await Notify.createChannel({ id: 'anniv', name: '최애 기념일', description: '생일·데뷔·공연 D-30, D-5, D-1, 당일', importance: 4, vibration: true }).catch(() => {});
    }
    const now = Date.now();
    const list = [];
    for (const it of items) {
      for (const before of [30, 5, 1, 0]) {
        const [y, m, d] = it.target.split('-').map(Number);
        const at = new Date(y, m - 1, d - before, 10, 0, 0);
        if (at.getTime() <= now) continue;
        list.push({
          id: NOTI_BASE + list.length,
          title: before === 0 ? `오늘은 ${it.name} ${it.label}!` : `${it.name} ${it.label} D-${before}`,
          body: before === 0 ? '응원봉 켤 시간이에요 💡' : before === 30 ? '한 달 남았어요. 준비 시작해 볼까요?' : `${before}일 남았어요`,
          channelId: 'anniv',
          schedule: { at, allowWhileIdle: true },
          extra: { hash: `#/idol/${it.idolId}` },
        });
        if (list.length >= 60) break; // 안드로이드 알람 수 제한 여유
      }
      if (list.length >= 60) break;
    }
    if (list.length) await Notify.schedule({ notifications: list });
    return 'granted';
  } catch { return 'unavailable'; }
}

export function initNative({ onBack, onOpenHash }) {
  if (!isApp) return;
  document.documentElement.classList.add('is-app', `is-${platform}`);
  StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
  if (platform === 'android') StatusBar.setBackgroundColor({ color: '#12102A' }).catch(() => {});
  App.addListener('backButton', () => { if (!onBack()) App.exitApp(); });
  Notify.addListener('localNotificationActionPerformed', ({ notification }) => {
    const h = notification?.extra?.hash;
    if (h) onOpenHash(h);
  });
}

// 홈 화면에 놓인 덕심 위젯 수 (안드로이드). 판정 지표 "위젯 설치율"에 쓴다.
export async function widgetCount() {
  if (!isApp || !WidgetBridge) return 0;
  try { return (await WidgetBridge.count()).count ?? 0; } catch { return 0; }
}
