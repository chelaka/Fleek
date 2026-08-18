import type { ModelPhoto, ModelPhotoInput, ModelPhotoWithThumb } from '@shared/types'
import { createCollection } from './collection'

/**
 * Photos of the user.
 *
 * Kept apart from the garment library rather than folded into it, because
 * they are a different kind of thing to hold: a garment is a product shot
 * anyone could have, and this is someone's face. Separate folder, separate
 * clear, so "forget my photos" never has to mean "forget my wardrobe".
 */

const photos = createCollection<ModelPhoto>('photos')

export function listModelPhotos(): ModelPhotoWithThumb[] {
  return photos.list()
}

export function addModelPhoto(input: ModelPhotoInput): ModelPhotoWithThumb {
  return photos.add(input, ({ id, imagePath, thumbPath }) => ({
    id,
    name: input.name.trim() || 'Photo',
    createdAt: Date.now(),
    imagePath,
    thumbPath,
    remoteUrl: input.remoteUrl,
    width: input.width,
    height: input.height
  }))
}

export function removeModelPhoto(id: string): void {
  photos.remove(id)
}

export function clearModelPhotos(): void {
  photos.clear()
}
