// Copyright (c) 2026 Parag Pandya. MIT License, see LICENSE.
// Timestamps for Claude Code: https://github.com/paragpandyareal/claude-code-timestamps

import { describe, expect, test } from 'claude-code/testing'
import { LIMITS, capRows, pruneKeys, readPrefs, readRecord } from '../hooks/store'
import { isOwnTranscript, timesFromTranscript } from '../hooks/transcript'

const DAY = 86_400_000

describe('store records', () => {
  test('bad values read as nothing', async () => {
    expect(readRecord(undefined)).toBe(undefined)
    expect(readRecord({ u: 'x', m: {} })).toBe(undefined)
    expect(readRecord({ u: 1, m: { a: 2, b: 'no' } })).toEqual({ u: 1, p: undefined, m: { a: 2 } })
    expect(readPrefs({ enabled: false, format: '13h', style: 'relative' })).toEqual({ enabled: false, style: 'relative' })
  })
  test('a session keeps its newest rows', async () => {
    const m: Record<string, number> = {}
    for (let i = 0; i < 10; i++) m['r' + i] = i
    expect(Object.keys(capRows(m, 3)).sort()).toEqual(['r7', 'r8', 'r9'])
  })
})

describe('pruning', () => {
  const rec = (u: number) => ({ u, m: {} })
  test('drops old, broken and excess sessions; keeps the live one', async () => {
    const now = 1000 * DAY
    const rows = [
      ['s:old', rec(now - 100 * DAY), 10],
      ['s:bad', undefined, 10],
      ['s:live', rec(now - 200 * DAY), 10],
      ['s:new', rec(now - DAY), 10],
    ] as const
    expect(pruneKeys(rows, now, 's:live').sort()).toEqual(['s:bad', 's:old'])
  })
  test('stays under the byte budget', async () => {
    const now = 10 * DAY
    const big = Math.floor(LIMITS.maxBytes / 3) + 1
    const rows = [
      ['s:a', rec(now - 3), big],
      ['s:b', rec(now - 2), big],
      ['s:c', rec(now - 1), big],
    ] as const
    expect(pruneKeys(rows, now)).toEqual(['s:a'])
  })
  test('keeps at most maxSessions', async () => {
    const now = 10 * DAY
    const rows = Array.from({ length: LIMITS.maxSessions + 5 }, (_, i) => ['s:' + i, rec(now - i), 1] as const)
    expect(pruneKeys(rows, now)).toHaveLength(5)
  })
})

describe('transcript backfill', () => {
  test('only the session own transcript file', async () => {
    expect(isOwnTranscript('/h/.claude/projects/x/abc-1.jsonl', 'abc-1')).toBe(true)
    expect(isOwnTranscript('/etc/passwd', 'abc-1')).toBe(false)
    expect(isOwnTranscript('/h/x/abc-1.jsonl', '../abc')).toBe(false)
    expect(isOwnTranscript(undefined, 'abc-1')).toBe(false)
  })
  test('reads prompts, replies, closing lines, tool calls and results; skips junk', async () => {
    const lines = [
      JSON.stringify({ type: 'user', uuid: 'u1', timestamp: '2026-10-12T03:13:02.254Z', message: { content: 'hi' } }),
      JSON.stringify({ type: 'user', uuid: 'meta', isMeta: true, timestamp: '2026-10-12T03:13:02.254Z' }),
      JSON.stringify({ type: 'system', subtype: 'turn_duration', uuid: 'd1', timestamp: '2026-10-12T03:13:03.906Z' }),
      JSON.stringify({ type: 'system', subtype: 'informational', uuid: 'i1', timestamp: '2026-10-12T03:13:03.906Z' }),
      JSON.stringify({ type: 'assistant', uuid: 'a1', timestamp: '2026-10-12T03:13:04.000Z', message: { content: [{ type: 'tool_use', id: 'toolu_1' }] } }),
      JSON.stringify({ type: 'user', uuid: 'r1', timestamp: '2026-10-12T03:13:09.000Z', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1' }] } }),
      '{"timestamp": broken',
      JSON.stringify({ type: 'mode' }),
    ].join('\n')
    const t = timesFromTranscript(lines)
    expect([...t.keys()].sort()).toEqual(['a1', 'd1', 'r1', 'r:toolu_1', 'toolu_1', 'u1'])
    expect(t.get('u1')).toBe(Date.parse('2026-10-12T03:13:02.254Z'))
    expect(t.get('r:toolu_1')).toBe(Date.parse('2026-10-12T03:13:09.000Z'))
  })
})
