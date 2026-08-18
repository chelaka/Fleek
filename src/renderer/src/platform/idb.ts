/**
 * A very small IndexedDB wrapper.
 *
 * Garment thumbnails are base64 and a library of a few hundred will not fit
 * in localStorage's ~5MB, so the library lives in IndexedDB. Nothing here
 * justifies a dependency: one object store, four operations.
 */

const DB_NAME = 'fleek'
const DB_VERSION = 1
const STORE = 'garments'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (): void => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
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
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await open()
  return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = run(tx.objectStore(STORE))
    request.onsuccess = (): void => resolve(request.result)
    request.onerror = (): void => reject(request.error ?? new Error('The garment library refused a write.'))
  })
}

export async function idbGetAll<T>(): Promise<T[]> {
  return await transact<T[]>('readonly', (store) => store.getAll() as IDBRequest<T[]>)
}

export async function idbPut<T>(value: T): Promise<void> {
  await transact('readwrite', (store) => store.put(value) as IDBRequest<IDBValidKey>)
}

export async function idbDelete(id: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(id) as unknown as IDBRequest<undefined>)
}

export async function idbClear(): Promise<void> {
  await transact('readwrite', (store) => store.clear() as unknown as IDBRequest<undefined>)
}
