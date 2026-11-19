// Telefondaki kopya (IndexedDB) — ARGUS Android uygulaması. Üç bölüm:
//   cache: PC'den gelen okuma cevapları, adrese göre ("/api/profiles/x/boards" → JSON)
//   queue: PC yokken yapılan, PC'ye gönderilmeyi bekleyen değişiklikler (sırayla)
//   meta:  son eşitleme, son manifest, gönderilemeyen değişiklikler…
const DB_NAME = 'argus-mobil'
const DB_VERSION = 1

export interface QueuedOp {
  id: string
  at: number
  method: string
  path: string
  body?: string
}

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache')
        if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { autoIncrement: true })
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export const cacheGet = <T = unknown>(key: string) => run<T | undefined>('cache', 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
export const cacheSet = (key: string, value: unknown) => run('cache', 'readwrite', (s) => s.put(value, key)).then(() => undefined)
export const cacheDelete = (key: string) => run('cache', 'readwrite', (s) => s.delete(key)).then(() => undefined)
export const cacheAllKeys = async () => ((await run('cache', 'readonly', (s) => s.getAllKeys())) as IDBValidKey[]).map(String)
export async function cacheKeys(prefix: string): Promise<string[]> {
  return (await cacheAllKeys()).filter((k) => k.startsWith(prefix))
}

// Hangi okumalar telefonda saklanır. Eskiden her okuma adresiyle birlikte (arama sözcüğü, tarih aralığı… dahil)
// saklanıyordu, telefondaki kopya durmadan büyüyordu. Artık "?" içeren adresler saklanmıyor (aşağıdakiler hariç);
// eşitlemenin kendi adresleri de saklanmıyor.
const QUERY_ALLOW = [/^\/api\/profiles\/[^/]+\/flashback\/[^/?]+\?year=\d{4}$/, /^\/api\/profiles\/[^/]+\/tmdb-genres\?type=(movie|tv)$/]
export function shouldCache(path: string): boolean {
  if (path.startsWith('/api/sync/') || path.startsWith('/api/mobile/') || path.startsWith('/api/ui-prefs')) return false
  if (!path.includes('?')) return true
  return QUERY_ALLOW.some((re) => re.test(path))
}

// Telefondaki kopyada "oku → değiştir → yaz" yapan işler (çevrimdışı değişiklik, PC'den gelen kopyanın üstüne
// bekleyen değişikliklerin yeniden işlenmesi, gönderilemeyenler listesi) sırayla çalışsın — araya girip birbirinin
// yazdığını ezmesinler. Tek bir uygulama penceresi var, bellekteki bir sıra yetiyor.
let lockTail: Promise<unknown> = Promise.resolve()
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lockTail.then(fn, fn)
  lockTail = next.catch(() => {})
  return next
}

export const metaGet = <T = unknown>(key: string) => run<T | undefined>('meta', 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
export const metaSet = (key: string, value: unknown) => run('meta', 'readwrite', (s) => s.put(value, key)).then(() => undefined)

export const queueAdd = (op: QueuedOp) => run('queue', 'readwrite', (s) => s.add(op)).then(() => undefined)
export const queueDelete = (key: IDBValidKey) => run('queue', 'readwrite', (s) => s.delete(key)).then(() => undefined)
export const queueCount = () => run<number>('queue', 'readonly', (s) => s.count())
export async function queueAll(): Promise<{ key: IDBValidKey; op: QueuedOp }[]> {
  const [keys, ops] = await Promise.all([
    run('queue', 'readonly', (s) => s.getAllKeys()) as Promise<IDBValidKey[]>,
    run('queue', 'readonly', (s) => s.getAll()) as Promise<QueuedOp[]>,
  ])
  return keys.map((key, i) => ({ key, op: ops[i] }))
}

// Bağlantı kaldırılınca telefondaki her şey silinir.
export async function wipeAll() {
  for (const s of ['cache', 'queue', 'meta']) await run(s, 'readwrite', (st) => st.clear())
}
