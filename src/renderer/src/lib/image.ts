/** Image plumbing shared by garment intake and still capture. */

export interface DecodedImage {
  element: HTMLImageElement
  width: number
  height: number
}

export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(blob)
  try {
    const element = new Image()
    await new Promise<void>((resolve, reject) => {
      element.onload = () => resolve()
      element.onerror = () => reject(new Error('That file is not an image Fleek can read.'))
      element.src = url
    })
    return { element, width: element.naturalWidth, height: element.naturalHeight }
  } finally {
    // The element keeps its own decoded copy, so the object URL can go now.
    URL.revokeObjectURL(url)
  }
}

/** A square, centre-cropped thumbnail for the tray. Returns base64 PNG. */
export function thumbnailBase64(image: DecodedImage, size = 128): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This machine would not give Fleek a drawing surface.')

  const side = Math.min(image.width, image.height)
  const sx = (image.width - side) / 2
  const sy = (image.height - side) / 2
  ctx.drawImage(image.element, sx, sy, side, side, 0, 0, size, size)

  return stripDataUrl(canvas.toDataURL('image/png'))
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // Chunked so a multi-megabyte photo doesn't blow the argument limit.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1)
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}

export function extensionFor(blob: Blob, fallbackName = ''): string {
  const byType = EXT_BY_TYPE[blob.type.toLowerCase()]
  if (byType) return byType
  const match = /\.([a-z0-9]+)$/i.exec(fallbackName)
  const byName = match?.[1]?.toLowerCase()
  return byName && ['jpg', 'jpeg', 'png', 'webp'].includes(byName) ? byName : 'png'
}

export function isSupportedImage(blob: Blob, name = ''): boolean {
  if (EXT_BY_TYPE[blob.type.toLowerCase()]) return true
  return /\.(jpe?g|png|webp)$/i.test(name)
}

/** Grabs the current frame of a playing video as base64 PNG. */
export function frameFromVideo(video: HTMLVideoElement, mirrored: boolean): string {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) throw new Error('There is no frame to capture yet.')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This machine would not give Fleek a drawing surface.')

  // The still should match what was on screen, mirror and all.
  if (mirrored) {
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(video, 0, 0, width, height)

  return stripDataUrl(canvas.toDataURL('image/png'))
}
