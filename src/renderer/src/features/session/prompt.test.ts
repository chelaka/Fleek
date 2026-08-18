import { describe, expect, it } from 'vitest'
import { buildPrompt, orderEntries, panelName } from './prompt'

describe('a single garment', () => {
  it('reads exactly like the v1 prompt did, with no panel talk', () => {
    expect(buildPrompt([{ slot: 'top' }])).toBe(
      'Substitute the current top with the top in the reference image, matching color, material, and fit. ' +
        'The reference may show the item alone, laid flat, on a hanger, or worn by someone else -- read its ' +
        'color, material, cut, and construction from whatever is shown. ' +
        'Keep everything else about the person unchanged.'
    )
  })

  it('adds rather than substitutes for things you are not already wearing', () => {
    expect(buildPrompt([{ slot: 'headwear' }])).toContain('Add the hat or cap in the reference image to the person')
    expect(buildPrompt([{ slot: 'bag' }])).toContain('Add the bag in the reference image to the person')
  })

  it('substitutes for things that replace what is worn', () => {
    expect(buildPrompt([{ slot: 'bottoms' }])).toContain('Substitute the current trousers or skirt')
  })
})

describe('several garments at once', () => {
  it('announces the grid and names each panel', () => {
    const prompt = buildPrompt([{ slot: 'top' }, { slot: 'headwear' }])
    expect(prompt).toContain('The reference image is a grid of 2 items.')
    // Head-down order: the cap is the left panel even though it was passed second.
    expect(prompt).toContain('Add the hat or cap in the left panel to the person')
    expect(prompt).toContain('substitute the current top with the top in the right panel')
  })

  it('joins three or more clauses with commas and a final and', () => {
    const prompt = buildPrompt([{ slot: 'top' }, { slot: 'headwear' }, { slot: 'bag' }])
    expect(prompt).toContain('grid of 3 items')
    expect(prompt).toMatch(/, and add the bag/)
  })

  it('always orders head-down regardless of pick order', () => {
    const ordered = orderEntries([{ slot: 'footwear' }, { slot: 'headwear' }, { slot: 'top' }])
    expect(ordered.map((e) => e.slot)).toEqual(['headwear', 'top', 'footwear'])
  })
})

describe('panel names match the composite layout', () => {
  it('uses left and right for two', () => {
    expect(panelName(0, 2)).toBe('left')
    expect(panelName(1, 2)).toBe('right')
  })

  it('uses quadrants for four', () => {
    expect(panelName(0, 4)).toBe('top left')
    expect(panelName(1, 4)).toBe('top right')
    expect(panelName(2, 4)).toBe('bottom left')
    expect(panelName(3, 4)).toBe('bottom right')
  })

  it('gives a lone final item the whole row', () => {
    // Three items: two on top, one spanning the bottom.
    expect(panelName(0, 3)).toBe('top left')
    expect(panelName(1, 3)).toBe('top right')
    expect(panelName(2, 3)).toBe('bottom')
  })

  it('says nothing about panels when there is only one item', () => {
    expect(panelName(0, 1)).toBe('')
  })
})

describe('the advanced override', () => {
  it('wins outright', () => {
    expect(buildPrompt([{ slot: 'top' }, { slot: 'bag' }], '  make me a wizard  ')).toBe('make me a wizard')
  })

  it('is ignored when blank', () => {
    expect(buildPrompt([{ slot: 'top' }], '   ')).toContain('Substitute the current top')
  })
})

describe('nothing selected', () => {
  it('falls back to the default sentence rather than an empty prompt', () => {
    expect(buildPrompt([])).toContain('Substitute the current top with the outfit from the reference image')
  })
})
