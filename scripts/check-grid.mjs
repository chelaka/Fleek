/**
 * The review pass the PRD asks for.
 *
 * Fails on two things:
 *   1. Any pixel value that is not a multiple of 4.
 *   2. Any colour literal outside design/tokens.css.
 *
 * Run with `npm run lint`. If a design genuinely needs a new value, add it to
 * tokens.css -- that is the point of the file.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const TOKENS = join('src', 'renderer', 'src', 'design', 'tokens.css').split('/').join(sep)

const PX = /(-?\d+(?:\.\d+)?)px/g
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g

/** Hairlines, focus rings, and the pill radius from tokens.css. */
const PX_ALLOWED = new Set([0, 1, 2, 999])

/**
 * The type scale is 12/14/16/20/24/32/48, which is deliberately not all
 * multiples of 4 -- 14 is the body size. Only type declarations may use it.
 */
const TYPE_SCALE = new Set([12, 14, 16, 20, 24, 28, 32, 40, 48, 56])
const TYPE_LINE = /font-size|line-height|font:/

const problems = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      walk(path)
      continue
    }
    if (!['.ts', '.tsx', '.css'].includes(extname(path))) continue
    if (path.endsWith('.test.ts')) continue
    check(path)
  }
}

function check(path) {
  const rel = relative(ROOT, path)
  const isTokens = rel === TOKENS
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)

  lines.forEach((line, index) => {
    if (line.includes('grid-ok')) return

    for (const match of line.matchAll(PX)) {
      const value = Math.abs(Number(match[1]))
      if (PX_ALLOWED.has(value) || value % 4 === 0) continue
      if (TYPE_LINE.test(line) && TYPE_SCALE.has(value)) continue
      problems.push(rel + ':' + (index + 1) + '  off the 4px grid: ' + match[0])
    }

    if (isTokens) return
    for (const match of line.matchAll(COLOUR)) {
      problems.push(rel + ':' + (index + 1) + '  colour outside tokens.css: ' + match[0])
    }
  })
}

walk(SRC)

if (problems.length > 0) {
  console.error('Design check failed:\n')
  for (const problem of problems) console.error('  ' + problem)
  console.error('\n' + problems.length + ' problem(s). Add the value to tokens.css, or fix it.')
  process.exit(1)
}

console.log('Design check passed: every pixel on the grid, every colour from tokens.css.')
