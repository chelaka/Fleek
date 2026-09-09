import { platform } from '@/platform'
import type { GarmentWithThumb } from '@shared/types'
import { decodeImage } from '@/lib/image'

/**
 * Decart's realtime state holds one reference image, so wearing several
 * things at once means drawing them onto a single sheet.
 *
 * The layout is two columns filled left to right, top to bottom, with an odd
 * final item spanning its row. `prompt.ts` names the panels from exactly the
 * same geometry -- if you change one, change the other, or the model will be
 * told the cap is on the left when it is drawn on the right.
 */

const CELL = 512

/** A single garment needs no sheet: its own image is a better reference. */
export function needsComposite(count: number): boolean {
  return count > 1
}

export async function composeReference(garments: readonly GarmentWithThumb[]): Promise<Blob> {
  if (garments.length === 0) throw new Error('There is nothing to compose.')

  const columns = garments.length === 1 ? 1 : 2
  const rows = Math.ceil(garments.length / columns)

  const canvas = document.createElement('canvas')
  canvas.width = columns * CELL
  canvas.height = rows * CELL
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This machine would not give Fleek a drawing surface.')

  // A flat, neutral ground. Anything textured here reads as part of a garment.
  ctx.fillStyle = '#FFFFFF' // grid-ok: reference sheets are for the model, not the UI
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let index = 0; index < garments.length; index++) {
    const garment = garments[index]!
    const row = Math.floor(index / columns)
    const column = index % columns

    // An odd final item spans its row, matching panelName()'s "bottom".
    const isLoneLast = index === garments.length - 1 && garments.length % columns === 1 && columns === 2
    const cellX = isLoneLast ? 0 : column * CELL
    const cellW = isLoneLast ? columns * CELL : CELL
    const cellY = row * CELL

    const image = await loadGarment(garment)

    // Contain, not cover: cropping a garment loses the part being judged.
    const scale = Math.min(cellW / image.width, CELL / image.height)
    const drawW = image.width * scale
    const drawH = image.height * scale
    ctx.drawImage(
      image.element,
      cellX + (cellW - drawW) / 2,
      cellY + (CELL - drawH) / 2,
      drawW,
      drawH
    )
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The reference sheet could not be encoded.'))),
      'image/jpeg',
      0.92
    )
  })
}

/**
 * The full-resolution original, read back from wherever this platform keeps
 * it -- disk under Electron, IndexedDB in a browser. Nothing is fetched over
 * the network any more, which is what makes a sheet cheap to rebuild.
 */
async function loadGarment(garment: GarmentWithThumb): Promise<Awaited<ReturnType<typeof decodeImage>>> {
  try {
    return await decodeImage(await platform.getImage('garment', garment.id))
  } catch {
    throw new Error('Could not load "' + garment.name + '" to build the reference sheet.')
  }
}

/** Identifies a set of active garments, so an unchanged set is not re-uploaded. */
export function referenceKey(garments: readonly GarmentWithThumb[]): string {
  return garments.map((g) => g.id).join('|')
}
