// 쓰던 글을 이 브라우저에 자동으로 보관합니다 (IndexedDB, 사진이 많아도 담을 수 있음).
// 로그인이 풀리거나 창이 닫혀도, 다음에 같은 글을 열면 되살릴 수 있어요.
// 발행·임시 저장에 성공하면 지웁니다.
export type Backup = {
  key: string;
  title: string;
  body: string;
  meta: Record<string, string>;
  keywords: string[];
  savedAt: number;
};

const DB = 'mgs-admin';
const STORE = 'backups';
let dbp: Promise<IDBDatabase> | null = null;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// IndexedDB를 못 쓰는 브라우저(일부 사생활 보호 모드)에서는 localStorage 로 대신합니다.
const LS = 'mgs_backup:';
function lsGet(key: string): Backup | null {
  try {
    return JSON.parse(localStorage.getItem(LS + key) || 'null');
  } catch {
    return null;
  }
}

export async function saveBackup(b: Backup) {
  try {
    await run('readwrite', (s) => s.put(b));
  } catch {
    try {
      localStorage.setItem(LS + b.key, JSON.stringify(b));
    } catch {
      /* 저장 공간이 모자라면 포기 (편집기 속 글은 그대로 있음) */
    }
  }
}

export async function loadBackup(key: string): Promise<Backup | null> {
  try {
    return ((await run('readonly', (s) => s.get(key))) as Backup | undefined) ?? lsGet(key);
  } catch {
    return lsGet(key);
  }
}

export async function clearBackup(key: string) {
  try {
    localStorage.removeItem(LS + key);
  } catch {
    /* 무시 */
  }
  try {
    await run('readwrite', (s) => s.delete(key));
  } catch {
    /* 무시 */
  }
}
