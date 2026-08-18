/**
 * Draws the app icon from the same tokens the UI uses, then writes a Windows
 * .ico. No image dependency: the PNG is encoded by hand over zlib, and an ICO
 * is just a header wrapped around PNG data.
 *
 *   node scripts/make-icon.mjs
 *
 * The mark is a mirror: a green-black disc, an amber rim catching the vanity
 * bulb on one side, and the soft band of the wipe crossing it.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')

const GLASS_000 = [0x0a, 0x0d, 0x0c]
const GLASS_100 = [0x12, 0x17, 0x16]
const GLASS_200 = [0x1b, 0x22, 0x20]
const BULB_500 = [0xe8, 0xa3, 0x3d]
const GLASS_900 = [0xe6, 0xec, 0xe9]

const mix = (a, b, t) => a.map((channel, i) => Math.round(channel + (b[i] - channel) * t))

function draw(size) {
  const px = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  const radius = size * 0.42
  const rim = size * 0.03

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c
      const dy = y - c
      const dist = Math.hypot(dx, dy)

      let colour = GLASS_000
      let alpha = 255

      if (dist <= radius) {
        // The glass itself, very slightly lit from the upper left.
        const lit = Math.max(0, (-dx - dy) / (size * 1.6))
        colour = mix(GLASS_100, GLASS_200, Math.min(1, lit + 0.15))

        // The wipe: a soft diagonal band of light crossing the disc.
        const band = Math.exp(-Math.pow((dx * 0.6 + dy) / (size * 0.16), 2))
        colour = mix(colour, GLASS_900, band * 0.22)
      }

      // The amber rim, brightest on the upper-left arc where the bulb is.
      const edge = Math.abs(dist - radius)
      if (edge <= rim) {
        const softness = 1 - edge / rim
        const facing = Math.max(0, (-dx - dy) / (radius * 2))
        colour = mix(colour, BULB_500, softness * (0.25 + facing * 0.75))
      }

      const i = (y * size + x) * 4
      px[i] = colour[0]
      px[i + 1] = colour[1]
      px[i + 2] = colour[2]
      px[i + 3] = alpha
    }
  }
  return px
}

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  // Every scanline is prefixed with filter type 0.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const entries = []
  let offset = 6 + images.length * 16

  for (const { size, data } of images) {
    const entry = Buffer.alloc(16)
    entry[0] = size >= 256 ? 0 : size // 0 means 256
    entry[1] = size >= 256 ? 0 : size
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += data.length
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

mkdirSync(OUT, { recursive: true })

const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = sizes.map((size) => ({ size, data: png(size, draw(size)) }))

writeFileSync(join(OUT, 'icon.ico'), ico(images))
writeFileSync(join(OUT, 'icon.png'), images[images.length - 1].data)

console.log('wrote build/icon.ico (' + sizes.join(', ') + ') and build/icon.png')
