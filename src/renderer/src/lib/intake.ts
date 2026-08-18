import { uploadGarmentImage } from '@/features/session/upload'
import { blobToBase64, decodeImage, extensionFor, thumbnailBase64 } from './image'

/**
 * The one path every dropped, pasted, browsed or shot image funnels through,
 * whether it is a garment or a photo of the user: decode, thumbnail, upload
 * to fal, and hand back everything a library entry needs.
 *
 * The upload is not billed. Only generation is.
 */

export interface PreparedImage {
  /** Base64 (no data: prefix) of the original. */
  imageBase64: string
  imageExt: string
  thumbBase64: string
  remoteUrl: string
  width: number
  height: number
}

export async function prepareImage(
  apiKey: string,
  blob: Blob,
  name: string
): Promise<PreparedImage> {
  const image = await decodeImage(blob)
  const thumbBase64 = thumbnailBase64(image)

  const file = new File([blob], name, { type: blob.type || 'image/png' })
  const remoteUrl = await uploadGarmentImage(apiKey, file)

  return {
    imageBase64: await blobToBase64(blob),
    imageExt: extensionFor(blob, name),
    thumbBase64,
    remoteUrl,
    width: image.width,
    height: image.height
  }
}

/** Strips the extension, so "navy-cardigan.jpg" becomes a usable label. */
export function labelFromFilename(name: string, fallback: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '') || fallback
}
