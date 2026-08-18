import {
  DEFAULT_SLOT,
  isSlotId,
  type Garment,
  type GarmentInput,
  type GarmentWithThumb
} from '@shared/types'
import { createCollection } from './collection'

/** Garment CRUD, on top of the shared on-disk collection. */

const garments = createCollection<Garment>('library', (raw) =>
  // Libraries written before slots existed have no slot; they were all tops.
  isSlotId(raw.slot) ? raw : { ...raw, slot: DEFAULT_SLOT }
)

export function listGarments(): GarmentWithThumb[] {
  return garments.list()
}

export function addGarment(input: GarmentInput): GarmentWithThumb {
  return garments.add(input, ({ id, imagePath, thumbPath }) => ({
    id,
    name: input.name.trim() || 'Garment',
    slot: isSlotId(input.slot) ? input.slot : DEFAULT_SLOT,
    createdAt: Date.now(),
    imagePath,
    thumbPath,
    remoteUrl: input.remoteUrl,
    width: input.width,
    height: input.height
  }))
}

export function removeGarment(id: string): void {
  garments.remove(id)
}

export function clearLibrary(): void {
  garments.clear()
}
