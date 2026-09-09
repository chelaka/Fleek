import { describe, expect, it } from 'vitest'
import { COST_PER_IMAGE, type GarmentWithThumb, type SlotId } from '@shared/types'
import { planStill, stillPrompt } from './still'

function garment(slot: SlotId, id: string = slot): GarmentWithThumb {
  return { id, name: id, slot, createdAt: 0, width: 512, height: 512, thumbDataUrl: '' }
}

describe('what a still can wear', () => {
  it('wears every slot, now that the still path is a general editor', () => {
    const plan = planStill([
      garment('headwear'),
      garment('eyewear'),
      garment('bag'),
      garment('footwear')
    ])
    expect(plan.steps).toHaveLength(4)
  })

  it('charges per garment', () => {
    expect(planStill([garment('top')]).cost).toBeCloseTo(COST_PER_IMAGE)
    expect(planStill([garment('top'), garment('bottoms')]).cost).toBeCloseTo(COST_PER_IMAGE * 2)
  })

  it('costs nothing when nothing is worn', () => {
    const plan = planStill([])
    expect(plan.steps).toEqual([])
    expect(plan.cost).toBe(0)
  })
})

describe('the order things go on in', () => {
  it('dresses from the inside out rather than head-down', () => {
    const plan = planStill([garment('outerwear'), garment('top'), garment('bottoms')])
    expect(plan.steps.map((step) => step.garment.slot)).toEqual(['bottoms', 'top', 'outerwear'])
  })

  it('leaves accessories until there is an outfit to put them on', () => {
    const plan = planStill([garment('bag'), garment('headwear'), garment('top')])
    expect(plan.steps.map((step) => step.garment.slot)).toEqual(['top', 'headwear', 'bag'])
  })

  it('does not depend on the order they were picked', () => {
    const picked = planStill([garment('outerwear'), garment('bottoms'), garment('top')])
    const other = planStill([garment('top'), garment('outerwear'), garment('bottoms')])
    expect(picked.steps.map((s) => s.garment.slot)).toEqual(other.steps.map((s) => s.garment.slot))
  })
})

describe('the instruction sent with each garment', () => {
  it('names the region the way the prompting guide does', () => {
    expect(stillPrompt(garment('top'))).toMatch(/^Substitute the upper body garment with the top/)
    expect(stillPrompt(garment('bottoms'))).toMatch(/^Substitute the lower body garment with/)
    expect(stillPrompt(garment('footwear'))).toMatch(/^Substitute the footwear with/)
  })

  it('adds rather than substitutes what the person may not be wearing at all', () => {
    expect(stillPrompt(garment('eyewear'))).toMatch(/^Add the glasses in the reference image/)
    expect(stillPrompt(garment('bag'))).toMatch(/^Add the bag in the reference image/)
  })

  it('names one action only, since each garment is its own request', () => {
    const prompt = stillPrompt(garment('top'))
    expect(prompt.match(/\bSubstitute\b/gi)).toHaveLength(1)
  })

  it('always says what must not change', () => {
    for (const slot of ['top', 'bottoms', 'headwear', 'bag'] as SlotId[]) {
      expect(stillPrompt(garment(slot))).toContain("Keep the person's face")
      expect(stillPrompt(garment(slot))).toContain('background')
    }
  })
})
