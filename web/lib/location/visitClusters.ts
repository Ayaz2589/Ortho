// Visit-cluster → candidate-routine grouping (spec 044 US4, AC3). Pure, side-effect-free — pairs
// with the opportunistic foreground captures from captureVisit.ts. A cluster is a "candidate": a
// repeating place the user visits, surfaced as a dismissible suggestion — NEVER an
// auto-created/modified transaction (FR-014). Contract: contracts/location-and-geocoding.md.

import type { RoutineVisit } from '../types'

/** Rounding granularity for the proximity bucket — roughly 150m at mid-latitudes. Coarse on
 *  purpose: a device's coordinate wobbles run/walk to run/walk, and the goal is "same place," not
 *  survey-grade precision. */
const PROXIMITY_DEGREES = 0.0015

export interface VisitCluster {
  /** Deterministic id from the rounded coordinate bucket — stable across re-clustering runs. */
  clusterId: string
  latitude: number
  longitude: number
  visitCount: number
  visitIds: string[]
}

function roundCoord(v: number): number {
  return Math.round(v / PROXIMITY_DEGREES) * PROXIMITY_DEGREES
}

/** Group visits by rounded-coordinate proximity; only buckets with `>= minVisits` become a
 *  candidate cluster (a single stray visit is not a routine). */
export function clusterVisits(visits: readonly RoutineVisit[], minVisits = 3): VisitCluster[] {
  const groups = new Map<string, RoutineVisit[]>()
  for (const v of visits) {
    const key = `${roundCoord(v.latitude)}:${roundCoord(v.longitude)}`
    const arr = groups.get(key) ?? []
    arr.push(v)
    groups.set(key, arr)
  }
  const out: VisitCluster[] = []
  for (const [clusterId, vs] of groups) {
    if (vs.length < minVisits) continue
    out.push({
      clusterId,
      latitude: vs.reduce((s, v) => s + v.latitude, 0) / vs.length,
      longitude: vs.reduce((s, v) => s + v.longitude, 0) / vs.length,
      visitCount: vs.length,
      visitIds: vs.map((v) => v.id),
    })
  }
  return out
}

/** The synthetic routine_key a cluster's confirm/dismiss state is stored under — reuses
 *  `recognized_routine_states` (no new table) via a `loc:` prefix distinct from `rc:`/`bh:`. */
export function clusterRoutineKey(clusterId: string): string {
  return `loc:${clusterId}`
}
