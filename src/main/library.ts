import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_SLOT, isSlotId, type Garment, type GarmentInput, type GarmentWithThumb } from '@shared/types'

/**
 * Garment CRUD on disk. A JSON index plus two image files per garment; no
 * database, because a few hundred garments do not need one.
 *
 *   userData/library/index.json
 *   userData/library/images/<id>.<ext>
 *   userData/library/thumbs/<id>.png
 */

const root = (): string => join(app.getPath('userData'), 'library')
const imagesDir = (): string => join(root(), 'images')
const thumbsDir = (): string => join(root(), 'thumbs')
const indexFile = (): string => join(root(), 'index.json')

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp'])

function ensureDirs(): void {
  mkdirSync(imagesDir(), { recursive: true })
  mkdirSync(thumbsDir(), { recursive: true })
}

function readIndex(): Garment[] {
  if (!existsSync(indexFile())) return []
  try {
    const parsed: unknown = JSON.parse(readFileSync(indexFile(), 'utf8'))
    return Array.isArray(parsed) ? (parsed as Garment[]) : []
  } catch {
    return []
  }
}

function writeIndex(entries: Garment[]): void {
  ensureDirs()
  writeFileSync(indexFile(), JSON.stringify(entries, null, 2), 'utf8')
}

function withThumb(g: Garment): GarmentWithThumb {
  let thumbDataUrl = ''
  try {
    // Always set on disk-backed entries; the field is optional only because
    // the web build has no filesystem to point at.
    thumbDataUrl = `data:image/png;base64,${readFileSync(g.thumbPath ?? '').toString('base64')}`
  } catch {
    // A missing thumbnail is not worth failing the whole list over; the tray
    // renders its own placeholder tile for an empty data URL.
  }
  return { ...g, thumbDataUrl }
}

export function listGarments(): GarmentWithThumb[] {
  return readIndex()
    .filter((g) => g.imagePath !== undefined && existsSync(g.imagePath))
    // Libraries written before slots existed have no slot; they were all tops.
    .map((g) => (isSlotId(g.slot) ? g : { ...g, slot: DEFAULT_SLOT }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(withThumb)
}

export function addGarment(input: GarmentInput): GarmentWithThumb {
  ensureDirs()
  const ext = ALLOWED_EXT.has(input.imageExt.toLowerCase()) ? input.imageExt.toLowerCase() : 'png'
  const id = randomUUID()
  const imagePath = join(imagesDir(), `${id}.${ext}`)
  const thumbPath = join(thumbsDir(), `${id}.png`)

  writeFileSync(imagePath, Buffer.from(input.imageBase64, 'base64'))
  writeFileSync(thumbPath, Buffer.from(input.thumbBase64, 'base64'))

  const garment: Garment = {
    id,
    name: input.name.trim() || 'Garment',
    slot: isSlotId(input.slot) ? input.slot : DEFAULT_SLOT,
    createdAt: Date.now(),
    imagePath,
    thumbPath,
    remoteUrl: input.remoteUrl,
    width: input.width,
    height: input.height
  }

  writeIndex([garment, ...readIndex()])
  return withThumb(garment)
}

export function removeGarment(id: string): void {
  const entries = readIndex()
  const target = entries.find((g) => g.id === id)
  if (target?.imagePath) rmSync(target.imagePath, { force: true })
  if (target?.thumbPath) rmSync(target.thumbPath, { force: true })
  writeIndex(entries.filter((g) => g.id !== id))
}

export function clearLibrary(): void {
  rmSync(root(), { recursive: true, force: true })
  ensureDirs()
}
