/**
 * A very small IndexedDB wrapper.
 *
 * Garment thumbnails are base64 and a library of a few hundred will not fit
 * in localStorage's ~5MB, so the library lives in IndexedDB. Photos of the
 * user sit in their own store beside it, for the same reason they get their
 * own folder on desktop: clearing one should never clear the other.
 *
 * Nothing here justifies a dependency: two object stores, four operations.
 */

const DB_NAME = 'fleek'
const DB_VERSION = 2

export const GARMENTS = 'garments'
export const MODELS = 'models'

export type StoreName = typeof GARMENTS | typeof MODELS

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    // Runs for a fresh database and for the v1 upgrade alike, which is why
    // it creates whatever is missing rather than branching on the version.
    request.onupgradeneeded = (): void => {
      const db = request.result
      for (const store of [GARMENTS, MODELS]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' })
      }
    }

    request.onsuccess = (): void => resolve(request.result)
    request.onerror = (): void =>
      reject(
        new Error(
          'This browser would not open local storage for the garment library. Private browsing can block it.'
        )
      )
  })

  return dbPromise
}

async function transact<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await open()
  return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = run(tx.objectStore(store))
    request.onsuccess = (): void => resolve(request.result)
    request.onerror = (): void => reject(request.error ?? new Error('The garment library refused a write.'))
  })
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return await transact<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
}

export async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  await transact(store, 'readwrite', (s) => s.put(value) as IDBRequest<IDBValidKey>)
}

export async function idbDelete(store: StoreName, id: string): Promise<void> {
  await transact(store, 'readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>)
}

export async function idbClear(store: StoreName): Promise<void> {
  await transact(store, 'readwrite', (s) => s.clear() as unknown as IDBRequest<undefined>)
}
