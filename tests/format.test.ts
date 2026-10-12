// Copyright (c) 2026 Parag Pandya. MIT License, see LICENSE.
// Timestamps for Claude Code: https://github.com/paragpandyareal/claude-code-timestamps

import { describe, expect, test } from 'claude-code/testing'
import { clockTime, closingLine, dayLabel, duration, gap, isSameDay, isoLocal, modelNote, msUntilMidnight, relativeTime, stamp, toolLine, utcOffset } from '../hooks/format'

// Local times, so the tests hold in any time zone.
const at = (d: number, h: number, m: number, s = 0) => new Date(2026, 9, d, h, m, s).getTime()
const NOW = at(12, 14, 7)

describe('clock', () => {
  test('24h pads hours and minutes', async () => {
    expect(clockTime(at(12, 9, 5), '24h')).toBe('09:05')
    expect(clockTime(at(12, 14, 5), '24h')).toBe('14:05')
    expect(clockTime(at(12, 0, 0), '24h')).toBe('00:00')
  })
  test('12h uses AM/PM like the engine', async () => {
    expect(clockTime(at(12, 14, 5), '12h')).toBe('2:05 PM')
    expect(clockTime(at(12, 0, 30), '12h')).toBe('12:30 AM')
    expect(clockTime(at(12, 12, 0), '12h')).toBe('12:00 PM')
  })
})

describe('stamp', () => {
  test('today shows the time', async () => {
    expect(stamp(at(12, 14, 5), NOW, { format: '24h', style: 'clock' })).toBe('14:05')
  })
  test('relative today', async () => {
    expect(stamp(at(12, 14, 6, 50), NOW, { format: '24h', style: 'relative' })).toBe('just now')
    expect(stamp(at(12, 14, 2), NOW, { format: '24h', style: 'relative' })).toBe('5m ago')
    expect(stamp(at(12, 11, 0), NOW, { format: '24h', style: 'relative' })).toBe('3h ago')
  })
  test('older than today shows the date, in either style', async () => {
    const s = stamp(at(9, 14, 5), NOW, { format: '24h', style: 'relative' })
    expect(s).toMatch(/^\S+ 9 \S+, 14:05$/)
    expect(stamp(at(9, 14, 5), NOW, { format: '12h', style: 'clock' })).toMatch(/, 2:05 PM$/)
  })
  test('another year adds the year', async () => {
    const old = new Date(2025, 9, 9, 14, 5).getTime()
    expect(dayLabel(old, NOW)).toMatch(/ 2025$/)
  })
  test('day boundaries', async () => {
    expect(isSameDay(at(12, 0, 0), at(12, 23, 59))).toBe(true)
    expect(isSameDay(at(11, 23, 59), at(12, 0, 0))).toBe(false)
    expect(relativeTime(NOW + 5000, NOW)).toBe('just now')
  })
})

describe('duration and closing line', () => {
  test('durations round down like the engine', async () => {
    expect(duration(1737)).toBe('1s')
    expect(duration(108_400)).toBe('1m 48s')
    expect(duration(3_720_000)).toBe('1h 2m')
    expect(duration(-5)).toBe('0s')
  })
  test('closing line', async () => {
    const p = { enabled: true, format: '24h' as const, style: 'clock' as const, showDuration: true }
    expect(closingLine(at(12, 14, 7), 108_400, NOW, p)).toBe('replied 14:07 · took 1m 48s')
    expect(closingLine(at(12, 14, 7), 108_400, NOW, { ...p, showDuration: false })).toBe('replied 14:07')
  })
  test('midnight timer lands just after midnight', async () => {
    const ms = msUntilMidnight(at(12, 23, 59))
    expect(ms).toBe(61_000)
  })
})

describe('tool calls', () => {
  const p = { format: '24h' as const, style: 'clock' as const, showDuration: true }
  test('time, and how long once the result is back', async () => {
    expect(toolLine(at(12, 14, 5), undefined, NOW, p)).toBe('14:05')
    expect(toolLine(at(12, 14, 5), at(12, 14, 5, 12), NOW, p)).toBe('14:05 · took 12s')
    expect(toolLine(at(12, 14, 5), at(12, 14, 5) + 400, NOW, p)).toBe('14:05')
    expect(toolLine(at(12, 14, 5), at(12, 14, 5, 12), NOW, { ...p, showDuration: false })).toBe('14:05')
  })
})

describe('the note Claude reads', () => {
  test('short, labelled, unambiguous', async () => {
    const t = at(12, 17, 21, 3)
    expect(isoLocal(t)).toBe('Mon 2026-10-12 17:21:03 ' + utcOffset(t))
    expect(modelNote(t, undefined, true, 'Australia/Sydney')).toBe(
      'Timestamp (timestamps plugin, not the user): ' + isoLocal(t) + ', Australia/Sydney.')
    expect(modelNote(t, at(12, 14, 5), false, 'Australia/Sydney')).toBe(
      'Timestamp (timestamps plugin, not the user): ' + isoLocal(t) + ". 3h 16m after the user's previous message.")
  })
  test('a short gap is left out; Claude has the earlier notes', async () => {
    expect(modelNote(at(12, 17, 21), at(12, 17, 12), false, 'X')).toBe('Timestamp (timestamps plugin, not the user): ' + isoLocal(at(12, 17, 21)) + '.')
    expect(modelNote(at(12, 17, 21), at(12, 17, 11), false, 'X')).toMatch(/\. 10m after the user's previous message\.$/)
  })
  test('stays short', async () => {
    const n = modelNote(at(12, 17, 21, 3), at(9, 8, 0), true, 'America/Los_Angeles')
    expect(n.length).toBeLessThan(140)
    expect(modelNote(at(12, 17, 21, 3), undefined, false, 'X').length).toBeLessThan(80)
  })
  test('gaps', async () => {
    expect(gap(12 * 60_000 + 5_000)).toBe('12m')
    expect(gap(3_600_000)).toBe('1h 0m')
    expect(gap(26 * 3_600_000)).toBe('1d 2h')
  })
  test('offsets', async () => {
    expect(utcOffset(NOW)).toMatch(/^[+-]\d{2}:\d{2}$/)
  })
})
