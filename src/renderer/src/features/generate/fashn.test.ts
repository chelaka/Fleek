import { describe, expect, it } from 'vitest'
import { COST_PER_IMAGE, type GarmentWithThumb, type SlotId } from '@shared/types'
import { describeSkipped, planStill } from './fashn'

function garment(slot: SlotId, id: string = slot): GarmentWithThumb {
  return {
    id,
    name: id,
    slot,
    createdAt: 0,
    remoteUrl: 'https://example.test/' + id + '.png',
    width: 512,
    height: 512,
    thumbDataUrl: ''
  }
}

describe('what a still can wear', () => {
  it('maps the slots FASHN has categories for', () => {
    const plan = planStill([garment('top')])
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]!.category).toBe('tops')
    expect(plan.skipped).toEqual([])
  })

  it('generates a jacket as a top, since FASHN has no outerwear category', () => {
    expect(planStill([garment('outerwear')]).steps[0]!.category).toBe('tops')
  })

  it('sets aside what a try-on model cannot wear at all', () => {
    const plan = planStill([garment('headwear'), garment('eyewear'), garment('bag'), garment('footwear')])
    expect(plan.steps).toEqual([])
    expect(plan.skipped).toHaveLength(4)
    expect(plan.cost).toBe(0)
  })

  it('keeps the wearable half of a mixed set rather than refusing the lot', () => {
    const plan = planStill([garment('top'), garment('headwear')])
    expect(plan.steps).toHaveLength(1)
    expect(plan.skipped).toHaveLength(1)
  })
})

describe('the order things go on in', () => {
  it('dresses innermost first, whatever order the tray hands them over', () => {
    const plan = planStill([garment('outerwear'), garment('bottoms'), garment('top')])
    expect(plan.steps.map((step) => step.garment.slot)).toEqual(['bottoms', 'top', 'outerwear'])
  })
})

describe('cost', () => {
  it('is one generation per wearable garment, and nothing for the rest', () => {
    const plan = planStill([garment('top'), garment('bottoms'), garment('bag')])
    expect(plan.cost).toBeCloseTo(2 * COST_PER_IMAGE)
  })
})

describe('what the user is told', () => {
  it('says nothing when nothing was dropped', () => {
    expect(describeSkipped([])).toBe('')
  })

  it('names one dropped item', () => {
    expect(describeSkipped([garment('headwear')])).toBe(
      'A still cannot wear hat or cap. Use the mirror for that.'
    )
  })

  it('joins several, and does not repeat a noun two garments share', () => {
    const sentence = describeSkipped([garment('bag', 'a'), garment('bag', 'b'), garment('footwear')])
    expect(sentence).toBe('A still cannot wear bag or shoes. Use the mirror for that.')
  })
})
