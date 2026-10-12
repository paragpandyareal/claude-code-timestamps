// Copyright (c) 2026 Parag Pandya. MIT License, see LICENSE.
// Timestamps for Claude Code: https://github.com/paragpandyareal/claude-code-timestamps

// Reads times back out of a session's own transcript file (JSONL), for rows
// recorded before the mod was loaded. Pure: the caller does the one fs.read.

/** True only for `<anything>/<sessionId>.jsonl`, the engine's own transcript name. */
export function isOwnTranscript(path: string | undefined, sessionId: string | undefined): path is string {
  if (!path || !sessionId || !/^[A-Za-z0-9-]+$/.test(sessionId)) return false
  return path.endsWith('/' + sessionId + '.jsonl') || path.endsWith('\\' + sessionId + '.jsonl')
}

type Block = { type?: unknown; id?: unknown; tool_use_id?: unknown }

type Line = {
  type?: unknown
  subtype?: unknown
  uuid?: unknown
  timestamp?: unknown
  isMeta?: unknown
  message?: { content?: unknown }
}

/**
 * Row id → epoch ms for the rows the mod draws: prompts and notifications,
 * Claude's blocks, the turn-closing lines, each tool call by its tool_use id,
 * and each tool result as `r:<tool_use id>`. A line that does not parse is
 * skipped.
 */
export function timesFromTranscript(text: string): Map<string, number> {
  return readTranscript(text).times
}

export type TranscriptTimes = { times: Map<string, number>; lastUser?: number; lastReply?: number }

/** The times, and when the person last typed and Claude last answered. */
export function readTranscript(text: string): TranscriptTimes {
  const out = new Map<string, number>()
  let lastUser: number | undefined
  let lastReply: number | undefined
  let start = 0
  while (start < text.length) {
    let end = text.indexOf('\n', start)
    if (end === -1) end = text.length
    const raw = text.slice(start, end)
    start = end + 1
    if (!raw.includes('"timestamp"')) continue
    let line: Line
    try {
      line = JSON.parse(raw)
    } catch {
      continue
    }
    if (typeof line.uuid !== 'string' || typeof line.timestamp !== 'string') continue
    const t = Date.parse(line.timestamp)
    if (!Number.isFinite(t)) continue
    const blocks = Array.isArray(line.message?.content) ? (line.message.content as Block[]) : []
    if (line.type === 'user' && line.isMeta !== true) {
      out.set(line.uuid, t)
      if (!blocks.some(b => b && b.type === 'tool_result') && (lastUser === undefined || t > lastUser)) lastUser = t
      for (const b of blocks) if (b && b.type === 'tool_result' && typeof b.tool_use_id === 'string') out.set('r:' + b.tool_use_id, t)
    } else if (line.type === 'system' && line.subtype === 'turn_duration') out.set(line.uuid, t)
    else if (line.type === 'assistant') {
      out.set(line.uuid, t)
      if (lastReply === undefined || t > lastReply) lastReply = t
      for (const b of blocks) if (b && b.type === 'tool_use' && typeof b.id === 'string') out.set(b.id, t)
    }
  }
  return { times: out, lastUser, lastReply }
}
