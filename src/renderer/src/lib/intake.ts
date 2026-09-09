import { blobToBase64, decodeImage, extensionFor, thumbnailBase64 } from './image'

/**
 * The one path every dropped, pasted, browsed or shot image funnels through,
 * whether it is a garment or a photo of the user: decode, thumbnail, and hand
 * back everything a library entry needs.
 *
 * This used to end with an upload. It does not any more -- Decart takes image
 * bytes inline on the request that uses them -- so adding a garment is now
 * entirely local, works offline, needs no key, and leaves nothing of the
 * user's wardrobe or likeness on a server between sessions.
 */

export interface PreparedImage {
  /** Base64 (no data: prefix) of the original. */
  imageBase64: string
  imageExt: string
  thumbBase64: string
  width: number
  height: number
}

export async function prepareImage(blob: Blob, name: string): Promise<PreparedImage> {
  const image = await decodeImage(blob)

  return {
    imageBase64: await blobToBase64(blob),
    imageExt: extensionFor(blob, name),
    thumbBase64: thumbnailBase64(image),
    width: image.width,
    height: image.height
  }
}

/** Strips the extension, so "navy-cardigan.jpg" becomes a usable label. */
export function labelFromFilename(name: string, fallback: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '') || fallback
}
