// Copyright (c) 2026 Parag Pandya. MIT License, see LICENSE.
// Timestamps for Claude Code: https://github.com/paragpandyareal/claude-code-timestamps

// timestamps: a dim time under each row of the conversation (or only under
// your own messages), "replied 14:07 · took 1m 48s" on the line that closes
// each turn, and one plain sentence with each prompt so Claude knows the time.
//
// Every hook here records or draws, then hands the event on. The one change
// to what Claude reads is that sentence, added beside the prompt as context.
// Any failure falls back to Claude Code's own behaviour.

import type { EngineInterface, PluginOptions, Register, RenderInput, RenderNode } from 'claude-code'
import { closingLine, localeHourFormat, modelNote, msUntilMidnight, stamp, toolLine, type HourFormat, type Prefs, type Sender, type Show, type Style } from './format'
import {
  PREFS_KEY,
  SESSION_PREFIX,
  capRows,
  pruneKeys,
  readPrefs,
  readRecord,
  sessionKey,
  type SessionRecord,
  type StoredPrefs,
} from './store'
import { isOwnTranscript, readTranscript } from './transcript'

type Options = {
  format: HourFormat | 'auto'
  style: Style
  showDuration: boolean
  show: Show
  tellClaude: boolean
  backfill: boolean
}

/** Row id → when it happened, for everything this process knows about. */
const times = new Map<string, number>()
/** The rows this session recorded itself, which is what gets stored. */
let own: Record<string, number> = {}
let sessionId: string | undefined
let transcriptPath: string | undefined
let stored: StoredPrefs = {}
let opt: Options = { format: 'auto', style: 'clock', showDuration: true, show: 'everything', tellClaude: true, backfill: true }
let systemFormat: HourFormat = '24h'
let drawsUI = true
let lastPromptAt: number | undefined
/** For Claude's note: when the person last sent a prompt, and Claude last answered. */
let lastUserAt: number | undefined
let lastReplyAt: number | undefined
let flushTimer: { cancel: () => void } | undefined
let tickTimer: { cancel: () => void } | undefined
let backfilledFor: string | undefined

const HELP = 'usage: /timestamps [on|off|12h|24h|clock|relative|all|mine|reset]'

function readOptions(o: PluginOptions): Options {
  return {
    format: o.format === '12h' || o.format === '24h' ? o.format : 'auto',
    style: o.style === 'relative' ? 'relative' : 'clock',
    showDuration: o.showDuration !== false,
    show: o.show === 'mine' ? 'mine' : 'everything',
    tellClaude: o.tellClaude !== false,
    backfill: o.backfill !== false,
  }
}

function show(): Show {
  return stored.show ?? opt.show
}

function prefs(): Prefs {
  return {
    enabled: stored.enabled ?? true,
    format: stored.format ?? (opt.format === 'auto' ? systemFormat : opt.format),
    style: stored.style ?? opt.style,
    showDuration: opt.showDuration,
  }
}

// ── storage ──────────────────────────────────────────────────────────────

async function flush($: EngineInterface) {
  flushTimer?.cancel()
  flushTimer = undefined
  if (!sessionId) return
  const rec: SessionRecord = { u: Date.now(), m: capRows(own) }
  if (transcriptPath) rec.p = transcriptPath
  if (lastUserAt !== undefined) rec.lu = lastUserAt
  if (lastReplyAt !== undefined) rec.lr = lastReplyAt
  own = rec.m
  await $.store.set(sessionKey(sessionId), rec)
}

function markDirty($: EngineInterface) {
  if (flushTimer) return
  flushTimer = $.clock.after(500, () => flush($).catch(() => {}))
}

function remember($: EngineInterface, id: string, t: number) {
  times.set(id, t)
  own[id] = t
  markDirty($)
}

const later = (a: number | undefined, b: number | undefined) => (a === undefined ? b : b === undefined ? a : Math.max(a, b))

async function backfillNow($: EngineInterface, file: string) {
  try {
    // Rejects over 4 MiB; then older rows just show no time.
    const text = await $.fs.read(file)
    let added = 0
    const read = readTranscript(text)
    lastUserAt = later(lastUserAt, read.lastUser)
    lastReplyAt = later(lastReplyAt, read.lastReply)
    for (const [k, t] of read.times) {
      if (!times.has(k)) {
        times.set(k, t)
        added++
      }
    }
    if (added) $.ui.invalidate('ui.render')
  } catch {}
}

/** Switches to session `id`: loads what it stored and, once, its transcript. */
async function enterSession($: EngineInterface, id: string, path: string | undefined, fill: boolean) {
  if (id !== sessionId) {
    if (sessionId && Object.keys(own).length) await flush($).catch(() => {})
    sessionId = id
    own = {}
    transcriptPath = undefined
    lastUserAt = undefined
    lastReplyAt = undefined
    const rec = readRecord(await $.store.get(sessionKey(id)))
    if (rec) {
      own = rec.m
      transcriptPath = rec.p
      lastUserAt = rec.lu
      lastReplyAt = rec.lr
      for (const [k, t] of Object.entries(rec.m)) times.set(k, t)
    }
  }
  if (path && path !== transcriptPath && isOwnTranscript(path, id)) {
    transcriptPath = path
    markDirty($)
  }
  const file = transcriptPath
  if (fill && opt.backfill && backfilledFor !== id && isOwnTranscript(file, id)) {
    backfilledFor = id
    // Off the hook's path: the prompt never waits on the read.
    $.clock.after(0, () => backfillNow($, file))
  }
  $.ui.invalidate('ui.render')
}

async function prune($: EngineInterface) {
  const keys = (await $.store.keys()).filter(k => k.startsWith(SESSION_PREFIX))
  if (keys.length < 2) return
  const rows = []
  for (const key of keys) {
    const raw = await $.store.get(key)
    rows.push([key, readRecord(raw), JSON.stringify(raw ?? null).length] as const)
  }
  for (const key of pruneKeys(rows, Date.now(), sessionId && sessionKey(sessionId))) await $.store.delete(key)
}

// ── redraws: once a minute in relative style, else once at midnight ──────

function schedule($: EngineInterface) {
  tickTimer?.cancel()
  tickTimer = undefined
  const p = prefs()
  if (!p.enabled || !drawsUI) return
  if (p.style === 'relative') {
    tickTimer = $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
  } else {
    tickTimer = $.clock.after(msUntilMidnight(Date.now()), () => {
      $.ui.invalidate('ui.render')
      schedule($)
    })
  }
}

async function refreshSurfaces($: EngineInterface) {
  const s = await $.session.surfaces()
  drawsUI = s.includes('terminal') || s.includes('desktop')
}

// ── drawing ──────────────────────────────────────────────────────────────

/** Claude Code's own row, with one dim line of ours under it. */
async function withLine($: EngineInterface, e: RenderInput, theirs: RenderNode, text: string) {
  const { Box, Text } = $.ui.resolve(e)
  return Box({
    flexDirection: 'column',
    children: [theirs, Text({ color: 'inactive', wrap: 'truncate-end', children: ['  ' + text] })],
  })
}

async function setPrefs($: EngineInterface, arg: string): Promise<string> {
  const cur = prefs()
  let next: StoredPrefs
  if (arg === '') next = { ...stored, enabled: !cur.enabled }
  else if (arg === 'on' || arg === 'off') next = { ...stored, enabled: arg === 'on' }
  else if (arg === '12h' || arg === '24h') next = { ...stored, format: arg, enabled: true }
  else if (arg === 'clock' || arg === 'relative') next = { ...stored, style: arg, enabled: true }
  else if (arg === 'all' || arg === 'everything') next = { ...stored, show: 'everything', enabled: true }
  else if (arg === 'mine') next = { ...stored, show: 'mine', enabled: true }
  else if (arg === 'reset') next = {}
  else return HELP
  stored = next
  try {
    await $.store.set(PREFS_KEY, stored)
  } catch {}
  schedule($)
  $.ui.invalidate('ui.render')
  const p = prefs()
  return p.enabled ? `on · ${p.format} · ${p.style} · ${show() === 'mine' ? 'your messages' : 'everything'}` : 'off'
}

export const register: Register = (on, options) => {
  opt = readOptions(options)
  systemFormat = localeHourFormat()

  // ── session lifecycle ────────────────────────────────────────────────

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'timestamps',
        description: 'Show or hide times, switch 12h/24h, clock/relative, or all rows/your messages only',
        argumentHint: '[on|off|12h|24h|clock|relative|all|mine|reset]',
        immediate: true,
      })
      stored = readPrefs(await $.store.get(PREFS_KEY))
      drawsUI = e.surface === 'terminal' || e.surface === 'desktop'
      // On a reload, fill in from the transcript this session already named.
      await enterSession($, await $.session.id(), undefined, true)
      schedule($)
      $.clock.after(5_000, () => prune($).catch(() => {}))
    } catch {}
    return next(e)
  }).catch(($, e, next) => next(e))

  // Fires after startup, /clear, /resume, /branch (fork) and compaction:
  // the one place that names the session's id and transcript file.
  on('classic.SessionStart', async ($, e, next) => {
    try {
      const fill = e.source === 'resume' || e.source === 'fork'
      if (e.session_id) await enterSession($, e.session_id, e.transcript_path, fill)
    } catch {}
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    try {
      await flush($)
    } catch {}
    return next(e)
  }).catch(($, e, next) => next(e))

  // ── recording ────────────────────────────────────────────────────────

  on('session.append', ($, e, next) => {
    try {
      const now = Date.now()
      const m = e.message
      const blocks = Array.isArray(m.content) ? m.content : []
      if (e.door === 'prompt' && m.type === 'user') {
        if (!e.agentId) {
          remember($, e.uuid, now)
          if (e.origin.kind !== 'task-notification') lastPromptAt = now
        }
      } else if (e.door === 'notice' && m.name === 'turn_duration') {
        if (!e.agentId) remember($, e.uuid, now)
      } else if (e.door === 'response') {
        // Each block of Claude's reply, and each tool call by its id.
        if (!e.agentId) {
          remember($, e.uuid, now)
          lastReplyAt = now
        }
        for (const b of blocks) if (b.type === 'tool_use' && typeof b.id === 'string') remember($, b.id, now)
      } else if (e.door === 'tool-result') {
        for (const b of blocks) if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') remember($, 'r:' + b.tool_use_id, now)
      } else if (e.door === 'command' && !e.agentId) {
        remember($, e.uuid, now)
      }
    } catch {}
    return next(e)
  }).catch(($, e, next) => next(e))

  // The one thing Claude reads from this mod: a sentence beside the prompt
  // saying when it was sent. The words you typed are never changed.
  on('prompt.submit', ($, e, next) => {
    try {
      if (!opt.tellClaude || e.origin.kind === 'plugin') return next(e)
      const now = Date.now()
      const sender: Sender = e.origin.kind === 'composer' ? 'user' : e.origin.kind === 'task-notification' ? 'notification' : 'other'
      const note = modelNote(now, lastUserAt, lastReplyAt, sender)
      if (sender === 'user') lastUserAt = now
      return next({ ...e, context: [...(e.context ?? []), note] })
    } catch {
      return next(e)
    }
  }).catch(($, e, next) => next(e))

  // Where nothing draws (the VS Code panel, claude -p), the turn's own
  // closing line is the only place a time can go.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.agentId) return result
      await refreshSurfaces($)
      const p = prefs()
      if (drawsUI || !p.enabled) return result
      const now = Date.now()
      const sent = lastPromptAt !== undefined ? 'sent ' + stamp(lastPromptAt, now, p) + ' · ' : ''
      return { ...result, text: sent + closingLine(now, e.durationMs, now, p) }
    } catch {
      return result
    }
  }).catch(($, e, next) => next(e))

  // ── drawing ──────────────────────────────────────────────────────────

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const p = prefs()
    if (!p.enabled || (show() === 'mine' && e.props.origin.kind !== 'composer')) return next(e)
    // The row is drawn once under a placeholder id before it is stored.
    const t = times.get(e.requestId) ?? (e.requestId === 'placeholder' ? Date.now() : undefined)
    if (t === undefined) return next(e)
    return withLine($, e, await next(e), stamp(t, Date.now(), p))
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const p = prefs()
    const t = times.get(e.requestId)
    if (!p.enabled || t === undefined) return next(e)
    const { Text } = $.ui.resolve(e)
    return Text({ color: 'inactive', children: ['✻ ' + closingLine(t, e.props.durationMs, Date.now(), p)] })
  }).catch(($, e, next) => next(e))

  // ── drawing: everything else, when `show` is everything ──────────────

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const p = prefs()
    const t = times.get(e.requestId)
    if (!p.enabled || show() !== 'everything' || t === undefined) return next(e)
    return withLine($, e, await next(e), stamp(t, Date.now(), p))
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const p = prefs()
    const t = times.get(e.requestId)
    if (!p.enabled || show() !== 'everything' || t === undefined) return next(e)
    return withLine($, e, await next(e), toolLine(t, times.get('r:' + e.requestId), Date.now(), p))
  }).catch(($, e, next) => next(e))

  // A collapsed run of calls ("Read 2 files, ran 1 shell command"): the first
  // call's time, and how long the run took. Expanded, each ToolUse has its own.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const p = prefs()
    if (!p.enabled || show() !== 'everything' || e.props.isExpanded) return next(e)
    let first: number | undefined
    let last: number | undefined
    for (const c of e.props.calls) {
      if (!c.tool_use_id) continue
      const a = times.get(c.tool_use_id)
      const b = times.get('r:' + c.tool_use_id)
      if (a !== undefined && (first === undefined || a < first)) first = a
      if (b !== undefined && (last === undefined || b > last)) last = b
    }
    if (first === undefined) return next(e)
    return withLine($, e, await next(e), toolLine(first, last, Date.now(), p))
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const p = prefs()
    const t = times.get(e.requestId)
    if (!p.enabled || show() !== 'everything' || t === undefined) return next(e)
    return withLine($, e, await next(e), stamp(t, Date.now(), p))
  }).catch(($, e, next) => next(e))

  // ── /timestamps ──────────────────────────────────────────────────────

  on('command.run', { command: 'timestamps' }, async ($, e) => ({
    text: await setPrefs($, e.args.trim().toLowerCase()),
  }))
}
