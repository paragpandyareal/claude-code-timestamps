// Copyright (c) 2026 Parag Pandya. MIT License, see LICENSE.
// Timestamps for Claude Code: https://github.com/paragpandyareal/claude-code-timestamps

// What the mod keeps in $.store, and how it stays small. Pure: no $ here.
//
//   prefs        what /timestamps last set (overrides the userConfig defaults)
//   s:<session>  { u: last write, p: transcript path, lu/lr: last prompt and reply,
//                  m: { rowId: epoch ms } }
//
// One key per session, so two sessions running at once never write the same key.

import type { HourFormat, Show, Style } from './format'

export const PREFS_KEY = 'prefs'
export const SESSION_PREFIX = 's:'

export type StoredPrefs = { enabled?: boolean; format?: HourFormat; style?: Style; show?: Show }

/** `lu` and `lr`: the user's last prompt and Claude's last reply, for Claude's note. */
export type SessionRecord = { u: number; p?: string; lu?: number; lr?: number; m: Record<string, number> }

/** Prune limits: well under the store's 4 MiB. */
export const LIMITS = {
  maxSessions: 200,
  maxBytes: 2 * 1024 * 1024,
  maxAgeMs: 90 * 24 * 60 * 60 * 1000,
  maxRowsPerSession: 5000,
}

export const sessionKey = (id: string) => SESSION_PREFIX + id

export function readPrefs(v: unknown): StoredPrefs {
  if (!v || typeof v !== 'object') return {}
  const o = v as Record<string, unknown>
  const out: StoredPrefs = {}
  if (typeof o.enabled === 'boolean') out.enabled = o.enabled
  if (o.format === '12h' || o.format === '24h') out.format = o.format
  if (o.style === 'clock' || o.style === 'relative') out.style = o.style
  if (o.show === 'everything' || o.show === 'mine') out.show = o.show
  return out
}

export function readRecord(v: unknown): SessionRecord | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  if (typeof o.u !== 'number' || !o.m || typeof o.m !== 'object') return undefined
  const m: Record<string, number> = {}
  for (const [k, t] of Object.entries(o.m as Record<string, unknown>)) if (typeof t === 'number') m[k] = t
  const rec: SessionRecord = { u: o.u, p: typeof o.p === 'string' ? o.p : undefined, m }
  if (typeof o.lu === 'number') rec.lu = o.lu
  if (typeof o.lr === 'number') rec.lr = o.lr
  return rec
}

/** Keeps the newest rows of one session when it passes the per-session cap. */
export function capRows(m: Record<string, number>, max = LIMITS.maxRowsPerSession): Record<string, number> {
  if (Object.keys(m).length <= max) return m
  const out: Record<string, number> = {}
  for (const [id, t] of Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, max)) out[id] = t
  return out
}

/**
 * Which session keys to delete: anything older than maxAgeMs, then the oldest
 * past maxSessions or past maxBytes of JSON. `keep` (the live session) stays.
 */
export function pruneKeys(
  records: ReadonlyArray<readonly [key: string, rec: SessionRecord | undefined, bytes: number]>,
  now: number,
  keep?: string,
): string[] {
  const doomed: string[] = []
  const live: Array<readonly [string, SessionRecord, number]> = []
  for (const [key, rec, bytes] of records) {
    if (key === keep && rec) live.push([key, rec, bytes])
    else if (!rec || now - rec.u > LIMITS.maxAgeMs) doomed.push(key)
    else live.push([key, rec, bytes])
  }
  live.sort((a, b) => (a[0] === keep ? -1 : b[0] === keep ? 1 : b[1].u - a[1].u))
  let total = 0
  live.forEach(([key, , bytes], i) => {
    total += bytes
    if (key !== keep && (i >= LIMITS.maxSessions || total > LIMITS.maxBytes)) doomed.push(key)
  })
  return doomed
}
