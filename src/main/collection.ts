import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * An image library on disk. A JSON index plus two image files per entry; no
 * database, because a few hundred entries do not need one.
 *
 *   userData/<name>/index.json
 *   userData/<name>/images/<id>.<ext>
 *   userData/<name>/thumbs/<id>.png
 *
 * Garments and photos of the user are the same shape of thing stored twice
 * over, so the shape lives here once and each caller supplies only what is
 * particular to it: how to build a record, and how to repair an old one.
 */

export interface DiskRecord {
  id: string
  createdAt: number
  imagePath?: string
  thumbPath?: string
}

/** The image half of any intake input. */
export interface ImageInput {
  /** Base64, no data: prefix. */
  imageBase64: string
  imageExt: string
  thumbBase64: string
}

export interface Collection<T extends DiskRecord> {
  list: () => (T & { thumbDataUrl: string })[]
  add: (input: ImageInput, build: (paths: BuiltPaths) => T) => T & { thumbDataUrl: string }
  remove: (id: string) => void
  clear: () => void
}

export interface BuiltPaths {
  id: string
  imagePath: string
  thumbPath: string
}

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp'])

/**
 * @param dirName folder under userData.
 * @param revive repairs a record written by an older version, which is where
 *   a field added after someone's library already existed gets its default.
 */
export function createCollection<T extends DiskRecord>(
  dirName: string,
  revive: (raw: T) => T = (raw) => raw
): Collection<T> {
  const root = (): string => join(app.getPath('userData'), dirName)
  const imagesDir = (): string => join(root(), 'images')
  const thumbsDir = (): string => join(root(), 'thumbs')
  const indexFile = (): string => join(root(), 'index.json')

  function ensureDirs(): void {
    mkdirSync(imagesDir(), { recursive: true })
    mkdirSync(thumbsDir(), { recursive: true })
  }

  function readIndex(): T[] {
    if (!existsSync(indexFile())) return []
    try {
      const parsed: unknown = JSON.parse(readFileSync(indexFile(), 'utf8'))
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }

  function writeIndex(entries: T[]): void {
    ensureDirs()
    writeFileSync(indexFile(), JSON.stringify(entries, null, 2), 'utf8')
  }

  function withThumb(entry: T): T & { thumbDataUrl: string } {
    let thumbDataUrl = ''
    try {
      // Always set on disk-backed entries; the field is optional only because
      // the web build has no filesystem to point at.
      thumbDataUrl = `data:image/png;base64,${readFileSync(entry.thumbPath ?? '').toString('base64')}`
    } catch {
      // A missing thumbnail is not worth failing the whole list over; the
      // callers render their own placeholder for an empty data URL.
    }
    return { ...entry, thumbDataUrl }
  }

  return {
    list() {
      return readIndex()
        .filter((entry) => entry.imagePath !== undefined && existsSync(entry.imagePath))
        .map(revive)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(withThumb)
    },

    add(input, build) {
      ensureDirs()
      const ext = ALLOWED_EXT.has(input.imageExt.toLowerCase()) ? input.imageExt.toLowerCase() : 'png'
      const id = randomUUID()
      const imagePath = join(imagesDir(), `${id}.${ext}`)
      const thumbPath = join(thumbsDir(), `${id}.png`)

      writeFileSync(imagePath, Buffer.from(input.imageBase64, 'base64'))
      writeFileSync(thumbPath, Buffer.from(input.thumbBase64, 'base64'))

      const entry = build({ id, imagePath, thumbPath })
      writeIndex([entry, ...readIndex()])
      return withThumb(entry)
    },

    remove(id) {
      const entries = readIndex()
      const target = entries.find((entry) => entry.id === id)
      if (target?.imagePath) rmSync(target.imagePath, { force: true })
      if (target?.thumbPath) rmSync(target.thumbPath, { force: true })
      writeIndex(entries.filter((entry) => entry.id !== id))
    },

    clear() {
      rmSync(root(), { recursive: true, force: true })
      ensureDirs()
    }
  }
}
