import { describe, expect, it } from 'vitest'
import {
  billedSeconds,
  capProgress,
  formatCost,
  formatElapsed,
  initialSession,
  isBilling,
  isCapReached,
  sessionReducer,
  statusWord,
  type SessionEvent,
  type SessionState
} from './machine'

const T0 = 1_700_000_000_000

function run(events: SessionEvent[], from: SessionState = initialSession): SessionState {
  return events.reduce(sessionReducer, from)
}

const start = (at = T0, capSeconds = 180): SessionEvent => ({
  type: 'START',
  garmentId: 'g1',
  capSeconds,
  at
})

/** idle -> requesting -> negotiating -> live, meter running from the last step. */
function goLive(at = T0, capSeconds = 180): SessionState {
  return run([
    start(at, capSeconds),
    { type: 'NEGOTIATING', at: at + 100 },
    { type: 'GENERATION_STARTED', at: at + 2000 }
  ])
}

describe('happy path', () => {
  it('walks idle to live', () => {
    expect(run([start()]).status).toBe('requesting')
    expect(run([start(), { type: 'NEGOTIATING', at: T0 }]).status).toBe('negotiating')
    expect(goLive().status).toBe('live')
  })

  it('does not bill before the first generated frame', () => {
    const negotiating = run([start(), { type: 'NEGOTIATING', at: T0 + 100 }])
    expect(isBilling(negotiating.status)).toBe(false)
    expect(billedSeconds(negotiating, T0 + 60_000)).toBe(0)
  })

  it('starts the meter at GENERATION_STARTED, not at START', () => {
    const live = goLive()
    // START was at T0, the first frame at T0+2000. Ten seconds later we owe
    // for ten seconds, not twelve.
    expect(billedSeconds(live, T0 + 12_000)).toBe(10)
  })
})

describe('billing arithmetic', () => {
  it('costs two cents a second', () => {
    const live = goLive()
    const stopped = sessionReducer(live, { type: 'STOP', at: T0 + 74_000 })
    expect(stopped.last?.seconds).toBe(72)
    expect(stopped.last?.cost).toBeCloseTo(1.44, 10)
  })

  it('freezes the total once the session closes', () => {
    const stopped = sessionReducer(goLive(), { type: 'STOP', at: T0 + 32_000 })
    expect(billedSeconds(stopped, T0 + 32_000)).toBe(30)
    expect(billedSeconds(stopped, T0 + 900_000)).toBe(30)
  })

  it('keeps billing across a swap and a degrade', () => {
    const live = goLive()
    const s = run(
      [
        { type: 'SWAP_REQUESTED', garmentId: 'g2', at: T0 + 5000 },
        { type: 'SWAP_APPLIED', at: T0 + 6000 },
        { type: 'DEGRADED', at: T0 + 7000 },
        { type: 'RECOVERED', at: T0 + 8000 }
      ],
      live
    )
    expect(s.status).toBe('live')
    expect(s.garmentId).toBe('g2')
    expect(billedSeconds(s, T0 + 22_000)).toBe(20)
  })
})

describe('the hard cap', () => {
  it('reports progress and trips exactly at the cap', () => {
    const live = goLive(T0, 10)
    expect(capProgress(live, T0 + 2000 + 8000)).toBeCloseTo(0.8, 10)
    expect(isCapReached(live, T0 + 2000 + 9999)).toBe(false)
    expect(isCapReached(live, T0 + 2000 + 10_000)).toBe(true)
  })

  it('closes itself and says why, in a sentence', () => {
    const live = goLive(T0, 180)
    const capped = sessionReducer(live, { type: 'CAP_REACHED', at: T0 + 2000 + 180_000 })
    expect(capped.status).toBe('closing')
    expect(capped.last?.reason).toBe('cap')
    expect(capped.last?.message).toBe('Session ended at your 3-minute limit. Total: $3.60.')
  })

  it('phrases a sub-minute cap in seconds', () => {
    const live = goLive(T0, 90)
    const capped = sessionReducer(live, { type: 'CAP_REACHED', at: T0 + 2000 + 90_000 })
    expect(capped.last?.message).toBe('Session ended at your 90-second limit. Total: $1.80.')
  })

  it('ignores a cap event when nothing is billing', () => {
    expect(sessionReducer(initialSession, { type: 'CAP_REACHED', at: T0 })).toBe(initialSession)
  })
})

describe('failure', () => {
  it('stops the meter and carries a readable reason', () => {
    const live = goLive()
    const failed = sessionReducer(live, {
      type: 'FAIL',
      reason: 'Lost the connection to fal. Your session stopped and stopped billing.',
      at: T0 + 12_000
    })
    expect(failed.status).toBe('failed')
    expect(failed.liveSince).toBeNull()
    expect(billedSeconds(failed, T0 + 600_000)).toBe(10)
    expect(failed.failure).toMatch(/^Lost the connection/)
    expect(failed.last?.message).toContain('Billed $0.20.')
  })

  it('can fail from any active state', () => {
    for (const s of [run([start()]), run([start(), { type: 'NEGOTIATING', at: T0 }]), goLive()]) {
      expect(sessionReducer(s, { type: 'FAIL', reason: 'x', at: T0 + 1 }).status).toBe('failed')
    }
  })

  it('cannot fail from idle', () => {
    expect(sessionReducer(initialSession, { type: 'FAIL', reason: 'x', at: T0 })).toBe(initialSession)
  })
})

describe('out-of-order and duplicate events', () => {
  it('refuses to start a second session on top of a live one', () => {
    const live = goLive()
    expect(sessionReducer(live, start(T0 + 50_000))).toBe(live)
  })

  it('does not restart the meter on a repeated GENERATION_STARTED', () => {
    const live = goLive()
    const again = sessionReducer(live, { type: 'GENERATION_STARTED', at: T0 + 40_000 })
    expect(again.liveSince).toBe(live.liveSince)
    expect(billedSeconds(again, T0 + 42_000)).toBe(40)
  })

  it('never enters live straight from idle', () => {
    expect(sessionReducer(initialSession, { type: 'GENERATION_STARTED', at: T0 }).status).toBe('idle')
  })

  it('ignores a swap request outside live', () => {
    const requesting = run([start()])
    expect(sessionReducer(requesting, { type: 'SWAP_REQUESTED', garmentId: 'g9', at: T0 })).toBe(
      requesting
    )
  })

  it('ignores a second STOP while closing', () => {
    const closing = sessionReducer(goLive(), { type: 'STOP', at: T0 + 10_000 })
    expect(sessionReducer(closing, { type: 'STOP', at: T0 + 11_000 })).toBe(closing)
  })
})

describe('teardown', () => {
  it('returns to idle but remembers what the last session cost', () => {
    const closing = sessionReducer(goLive(), { type: 'STOP', at: T0 + 62_000 })
    const idle = sessionReducer(closing, { type: 'CLOSED', at: T0 + 62_100 })
    expect(idle.status).toBe('idle')
    expect(idle.liveSince).toBeNull()
    expect(idle.accumulatedMs).toBe(0)
    expect(idle.last?.cost).toBeCloseTo(1.2, 10)
  })

  it('keeps the cap setting across sessions', () => {
    const idle = run(
      [{ type: 'STOP', at: T0 + 5000 }, { type: 'CLOSED', at: T0 + 5100 }],
      goLive(T0, 300)
    )
    expect(idle.capSeconds).toBe(300)
  })
})

describe('presentation helpers', () => {
  it('maps every status to exactly one word', () => {
    expect(statusWord('idle')).toBe('ready')
    expect(statusWord('requesting')).toBe('connecting')
    expect(statusWord('negotiating')).toBe('connecting')
    expect(statusWord('live')).toBe('live')
    expect(statusWord('swapping')).toBe('live')
    expect(statusWord('degraded')).toBe('reconnecting')
    expect(statusWord('closing')).toBe('stopped')
    expect(statusWord('failed')).toBe('stopped')
  })

  it('formats the HUD', () => {
    expect(formatElapsed(72)).toBe('01:12')
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(600)).toBe('10:00')
    expect(formatCost(1.44)).toBe('$1.44')
  })
})
