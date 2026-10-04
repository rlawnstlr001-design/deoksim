// 기기 저장소(IndexedDB). 최애·기념일·지출은 이 기기 안에만 저장된다.
const DB_NAME = 'deoksim';
const VERSION = 1;
const STORES = ['idols', 'annivs', 'expenses'];

let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let out;
    Promise.resolve(fn(t.objectStore(store))).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const getAll = (store) => tx(store, 'readonly', (s) => reqP(s.getAll()));
export const get = (store, key) => tx(store, 'readonly', (s) => reqP(s.get(key)));
export const put = (store, value, key) => tx(store, 'readwrite', (s) => { s.put(value, key); });
export const putMany = (store, values) => tx(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); });
export const del = (store, key) => tx(store, 'readwrite', (s) => { s.delete(key); });
export const delMany = (store, keys) => tx(store, 'readwrite', (s) => { keys.forEach((k) => s.delete(k)); });

export async function askPersist() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
