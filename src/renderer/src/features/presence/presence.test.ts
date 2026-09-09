import { describe, expect, it } from 'vitest'
import { PRESENCE_ARRIVE_SECONDS, PRESENCE_GRACE_SECONDS } from '@shared/types'
import { decidePresence, describePresence, type DecideOptions } from './presence'

const NOW = 1_000_000

/** Held the current signal for `seconds`, with everything else permissive. */
function at(seconds: number, overrides: Partial<DecideOptions> = {}): DecideOptions {
  return {
    mode: 'auto',
    signal: { seen: true, since: NOW - seconds * 1000 },
    active: false,
    canStart: true,
    at: NOW,
    ...overrides
  }
}

describe('manual never touches billing', () => {
  it('does not start however long someone stands there', () => {
    expect(decidePresence(at(600, { mode: 'manual' }))).toBe('none')
  })

  it('does not stop however long the room is empty', () => {
    expect(
      decidePresence(
        at(600, { mode: 'manual', active: true, signal: { seen: false, since: NOW - 600_000 } })
      )
    ).toBe('none')
  })
})

describe('auto starts, but only once it is sure', () => {
  it('waits out the arrival delay rather than starting on one frame', () => {
    expect(decidePresence(at(0))).toBe('none')
    expect(decidePresence(at(PRESENCE_ARRIVE_SECONDS - 0.1))).toBe('none')
  })

  it('starts once someone has been there long enough', () => {
    expect(decidePresence(at(PRESENCE_ARRIVE_SECONDS))).toBe('start')
  })

  it('will not start when there is nothing to wear or no camera', () => {
    expect(decidePresence(at(60, { canStart: false }))).toBe('none')
  })

  it('will not start a second session on top of a running one', () => {
    expect(decidePresence(at(60, { active: true }))).toBe('none')
  })
})

describe('auto-stop never starts anything', () => {
  it('ignores someone walking into an idle frame', () => {
    expect(decidePresence(at(600, { mode: 'autostop' }))).toBe('none')
  })

  it('still stops a running session when the room empties', () => {
    expect(
      decidePresence(
        at(PRESENCE_GRACE_SECONDS, {
          mode: 'autostop',
          active: true,
          signal: { seen: false, since: NOW - PRESENCE_GRACE_SECONDS * 1000 }
        })
      )
    ).toBe('stop')
  })
})

describe('leaving is forgiving', () => {
  const empty = (seconds: number, mode: DecideOptions['mode'] = 'auto'): PresenceAction =>
    decidePresence(
      at(seconds, { mode, active: true, signal: { seen: false, since: NOW - seconds * 1000 } })
    )
  type PresenceAction = ReturnType<typeof decidePresence>

  it('does not end a session on a dropped frame', () => {
    expect(empty(0)).toBe('none')
    expect(empty(1)).toBe('none')
  })

  it('holds the session through a glance away', () => {
    expect(empty(PRESENCE_GRACE_SECONDS - 0.5)).toBe('none')
  })

  it('gives up once the grace period is spent', () => {
    expect(empty(PRESENCE_GRACE_SECONDS)).toBe('stop')
    expect(empty(PRESENCE_GRACE_SECONDS, 'autostop')).toBe('stop')
  })

  it('is more patient about leaving than about arriving', () => {
    expect(PRESENCE_GRACE_SECONDS).toBeGreaterThan(PRESENCE_ARRIVE_SECONDS)
  })
})

describe('what the stage says about it', () => {
  it('says nothing at all in manual', () => {
    expect(describePresence('manual', false, false, true)).toBeNull()
  })

  it('says nothing until the detector is actually running', () => {
    expect(describePresence('auto', false, false, false)).toBeNull()
  })

  it('says nothing while someone is there', () => {
    expect(describePresence('auto', true, false, true)).toBeNull()
    expect(describePresence('auto', true, true, true)).toBeNull()
  })

  it('warns that a running session is about to end', () => {
    expect(describePresence('auto', false, true, true)).toMatch(/stops shortly/)
    expect(describePresence('autostop', false, true, true)).toMatch(/stops shortly/)
  })

  it('invites you in only where stepping in would do something', () => {
    expect(describePresence('auto', false, false, true)).toMatch(/Step into frame/)
    expect(describePresence('autostop', false, false, true)).toBeNull()
  })
})
