// Copyright (c) 2026 Parag Pandya. MIT License, see LICENSE.
// Timestamps for Claude Code: https://github.com/paragpandyareal/claude-code-timestamps

// Pure time formatting. Every function takes `now` so tests are deterministic
// and nothing here reaches outside the module.

export type HourFormat = '12h' | '24h'
export type Style = 'clock' | 'relative'
export type Show = 'everything' | 'mine'

export type Prefs = {
  enabled: boolean
  format: HourFormat
  style: Style
  showDuration: boolean
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 12h or 24h, as the system locale writes an hour. 24h if Intl can't say. */
export function localeHourFormat(): HourFormat {
  try {
    const o = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions()
    if (o.hourCycle) return o.hourCycle === 'h11' || o.hourCycle === 'h12' ? '12h' : '24h'
    return o.hour12 ? '12h' : '24h'
  } catch {
    return '24h'
  }
}

const pad = (n: number) => (n < 10 ? '0' + n : String(n))

/** `14:05` or `2:05 PM`. */
export function clockTime(ts: number, format: HourFormat): string {
  const d = new Date(ts)
  const h = d.getHours()
  const m = pad(d.getMinutes())
  if (format === '24h') return pad(h) + ':' + m
  return (h % 12 || 12) + ':' + m + (h < 12 ? ' AM' : ' PM')
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function namePart(d: Date, opt: Intl.DateTimeFormatOptions, fallback: string): string {
  try {
    const s = new Intl.DateTimeFormat(undefined, opt).format(d).replace(/\.$/, '')
    return s || fallback
  } catch {
    return fallback
  }
}

/** `Mon 9 Oct`, with the year when it isn't this year's. */
export function dayLabel(ts: number, now: number): string {
  const d = new Date(ts)
  const wd = namePart(d, { weekday: 'short' }, WEEKDAYS[d.getDay()] ?? '')
  const mon = namePart(d, { month: 'short' }, MONTHS[d.getMonth()] ?? '')
  const year = d.getFullYear() !== new Date(now).getFullYear() ? ' ' + d.getFullYear() : ''
  return wd + ' ' + d.getDate() + ' ' + mon + year
}

export function isSameDay(a: number, b: number): boolean {
  const x = new Date(a)
  const y = new Date(b)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
}

/** `just now`, `5m ago`, `3h ago`. Only used for today's messages. */
export function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts)
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return Math.floor(diff / MINUTE) + 'm ago'
  return Math.floor(diff / HOUR) + 'h ago'
}

/** What a message shows: today's time (or relative), or the date and time. */
export function stamp(ts: number, now: number, prefs: Pick<Prefs, 'format' | 'style'>): string {
  if (!isSameDay(ts, now)) return dayLabel(ts, now) + ', ' + clockTime(ts, prefs.format)
  if (prefs.style === 'relative') return relativeTime(ts, now)
  return clockTime(ts, prefs.format)
}

/** `5s`, `1m 48s`, `1h 2m`, rounded down the way the engine's line is. */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm ' + (s % 60) + 's'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h ' + (m % 60) + 'm'
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h'
}

/** `replied 14:07 · took 1m 48s`, or without the duration. */
export function closingLine(ts: number, durationMs: number | undefined, now: number, prefs: Prefs): string {
  const head = 'replied ' + stamp(ts, now, prefs)
  if (!prefs.showDuration || durationMs === undefined) return head
  return head + ' · took ' + duration(durationMs)
}

/** A tool call: `14:05`, or `14:05 · took 12s` once its result is back. */
export function toolLine(call: number, result: number | undefined, now: number, prefs: Pick<Prefs, 'format' | 'style' | 'showDuration'>): string {
  const head = stamp(call, now, prefs)
  if (!prefs.showDuration || result === undefined || result - call < 1000) return head
  return head + ' · took ' + duration(result - call)
}

/** Milliseconds until the next local midnight, plus a second of slack. */
export function msUntilMidnight(now: number): number {
  const d = new Date(now)
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  return Math.min(DAY, next - now) + 1000
}

// ── the note Claude reads with each prompt ───────────────────────────────
// Kept short on purpose: it rides on every prompt. About 25 tokens.

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** `+11:00`, `-04:30`, `+00:00`. */
export function utcOffset(ts: number): string {
  const off = -new Date(ts).getTimezoneOffset()
  const a = Math.abs(off)
  return (off < 0 ? '-' : '+') + pad(Math.floor(a / 60)) + ':' + pad(a % 60)
}

/** The IANA zone name (`Australia/Sydney`), or undefined. */
export function timeZoneName(): string | undefined {
  try {
    const z = new Intl.DateTimeFormat().resolvedOptions().timeZone
    return z && z !== 'UTC' && z !== 'Etc/UTC' ? z : undefined
  } catch {
    return undefined
  }
}

/** `Mon 2026-10-12 14:05:07 +11:00`: unambiguous in any locale, 24-hour, with its offset. */
export function isoLocal(ts: number): string {
  const d = new Date(ts)
  return (SHORT_WEEKDAYS[d.getDay()] ?? '') + ' ' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' ' + utcOffset(ts)
}

/** `12m`, `3h 16m`, `2d 4h`. */
export function gap(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h ' + (m % 60) + 'm'
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h'
}

/** Below this, Claude can tell the gap from the earlier notes in its context. */
export const GAP_SHOWN_FROM = 10 * 60_000

/**
 * The note the model reads beside a prompt, never shown:
 * `Timestamp (timestamps plugin, not the user): Mon 2026-10-12 17:21:03 +11:00, Australia/Sydney. 3h 16m after the user's previous message.`
 * The zone name only when `withZone` (the session's first note); the gap only when it's long.
 */
export function modelNote(ts: number, previousUser: number | undefined, withZone: boolean, zone = timeZoneName()): string {
  let s = 'Timestamp (timestamps plugin, not the user): ' + isoLocal(ts)
  if (withZone && zone) s += ', ' + zone
  if (previousUser !== undefined && ts - previousUser >= GAP_SHOWN_FROM) s += '. ' + gap(ts - previousUser) + " after the user's previous message"
  return s + '.'
}
