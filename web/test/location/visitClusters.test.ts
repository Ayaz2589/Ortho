import { describe, expect, it } from 'vitest'
import { clusterVisits, clusterRoutineKey } from '../../lib/location/visitClusters'
import type { RoutineVisit } from '../../lib/types'

function visit(over: Partial<RoutineVisit>): RoutineVisit {
  return {
    id: `v-${Math.random().toString(36).slice(2)}`,
    user_id: 'u',
    household_id: 'h',
    captured_at: '2026-08-01T09:00:00Z',
    latitude: 40.7128,
    longitude: -74.006,
    accuracy_meters: 10,
    created_at: '2026-08-01T09:00:00Z',
    ...over,
  }
}

describe('clusterVisits', () => {
  it('groups nearby visits into one cluster once minVisits is met', () => {
    const visits = [
      visit({ latitude: 40.7128, longitude: -74.006 }),
      visit({ latitude: 40.7129, longitude: -74.0061 }),
      visit({ latitude: 40.7127, longitude: -74.0059 }),
    ]
    const clusters = clusterVisits(visits, 3)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].visitCount).toBe(3)
  })

  it('below minVisits produces no cluster', () => {
    const visits = [visit({}), visit({})]
    expect(clusterVisits(visits, 3)).toHaveLength(0)
  })

  it('far-apart visits never merge into one cluster', () => {
    const visits = [
      visit({ latitude: 40.7128, longitude: -74.006 }),
      visit({ latitude: 40.7128, longitude: -74.006 }),
      visit({ latitude: 40.7128, longitude: -74.006 }),
      visit({ latitude: 34.0522, longitude: -118.2437 }), // LA — nowhere near NYC
      visit({ latitude: 34.0522, longitude: -118.2437 }),
      visit({ latitude: 34.0522, longitude: -118.2437 }),
    ]
    const clusters = clusterVisits(visits, 3)
    expect(clusters).toHaveLength(2)
  })

  it('clusterId is deterministic and stable across re-clustering the same visits', () => {
    const visits = [
      visit({ latitude: 40.7128, longitude: -74.006 }),
      visit({ latitude: 40.7128, longitude: -74.006 }),
      visit({ latitude: 40.7128, longitude: -74.006 }),
    ]
    const a = clusterVisits(visits, 3)[0].clusterId
    const b = clusterVisits([...visits].reverse(), 3)[0].clusterId
    expect(a).toBe(b)
  })
})

describe('clusterRoutineKey', () => {
  it('prefixes with loc: so it never collides with rc:/bh: keys', () => {
    expect(clusterRoutineKey('40.71:-74.01')).toBe('loc:40.71:-74.01')
  })
})
