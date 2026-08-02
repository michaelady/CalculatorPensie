/**
 * Stocare temporară pe dispozitiv (OPFS) cu fallback IndexedDB.
 * Folosită pentru chunk-urile PDF înainte de OCR secvențial.
 */

const DB_NAME = 'pensiero-temp-files'
const STORE = 'files'
const OPFS_DIR = 'ocr-chunks'

export interface TempFileHandle {
  id: string
  name: string
  mimeType: string
}

function canUseOpfs(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory
}

async function opfsRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(OPFS_DIR, { create: true })
}

async function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponibil'))
  })
}

async function idbPut(id: string, name: string, blob: Blob): Promise<void> {
  const db = await idbOpen()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ id, name, blob, mimeType: blob.type })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Salvare IndexedDB eșuată'))
    })
  } finally {
    db.close()
  }
}

async function idbGet(id: string): Promise<Blob | null> {
  const db = await idbOpen()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => {
        const row = req.result as { blob?: Blob } | undefined
        resolve(row?.blob ?? null)
      }
      req.onerror = () => reject(req.error ?? new Error('Citire IndexedDB eșuată'))
    })
  } finally {
    db.close()
  }
}

async function idbDelete(id: string): Promise<void> {
  const db = await idbOpen()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Ștergere IndexedDB eșuată'))
    })
  } finally {
    db.close()
  }
}

/** Salvează un blob temporar pe telefon; returnează handle-ul pentru citire ulterioară. */
export async function saveTempFile(
  name: string,
  data: Blob | Uint8Array,
  mimeType = 'application/pdf',
): Promise<TempFileHandle> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${name}`
  const blob =
    data instanceof Blob ? data : new Blob([data as BlobPart], { type: mimeType })

  if (canUseOpfs()) {
    try {
      const dir = await opfsRoot()
      const handle = await dir.getFileHandle(id, { create: true })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { id, name, mimeType: blob.type || mimeType }
    } catch {
      // fallback IndexedDB
    }
  }

  await idbPut(id, name, blob)
  return { id, name, mimeType: blob.type || mimeType }
}

/** Citește un fișier temporar ca File (pentru pipeline-ul OCR existent). */
export async function readTempFile(handle: TempFileHandle): Promise<File> {
  if (canUseOpfs()) {
    try {
      const dir = await opfsRoot()
      const fileHandle = await dir.getFileHandle(handle.id)
      const file = await fileHandle.getFile()
      return new File([file], handle.name, {
        type: handle.mimeType || file.type || 'application/pdf',
      })
    } catch {
      // fallback IndexedDB
    }
  }

  const blob = await idbGet(handle.id)
  if (!blob) throw new Error(`Fișierul temporar ${handle.name} nu a fost găsit`)
  return new File([blob], handle.name, { type: handle.mimeType || blob.type })
}

export async function deleteTempFile(handle: TempFileHandle): Promise<void> {
  if (canUseOpfs()) {
    try {
      const dir = await opfsRoot()
      await dir.removeEntry(handle.id)
      return
    } catch {
      // fallback
    }
  }
  try {
    await idbDelete(handle.id)
  } catch {
    /* ignore */
  }
}

/** Șterge chunk-urile dintr-o sesiune (după id/name care conțin prefixul). */
export async function clearTempSession(sessionPrefix: string): Promise<void> {
  if (canUseOpfs()) {
    try {
      const dir = await opfsRoot()
      // entries() e mai larg suportat decât keys() pe unele WebView-uri
      const entries =
        'entries' in dir && typeof dir.entries === 'function'
          ? dir.entries()
          : null
      if (entries) {
        for await (const [name] of entries as AsyncIterable<[string, FileSystemHandle]>) {
          if (name.includes(sessionPrefix)) {
            try {
              await dir.removeEntry(name)
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const db = await idbOpen()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        const req = store.openCursor()
        req.onsuccess = () => {
          const cursor = req.result
          if (!cursor) return
          const row = cursor.value as { id?: string; name?: string }
          if (
            String(row.id ?? '').includes(sessionPrefix) ||
            String(row.name ?? '').includes(sessionPrefix)
          ) {
            cursor.delete()
          }
          cursor.continue()
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('Curățare sesiune eșuată'))
      })
    } finally {
      db.close()
    }
  } catch {
    /* ignore */
  }
}
