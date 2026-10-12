// Copyright (c) 2026 Parag Pandya. MIT License, see LICENSE.
// Timestamps for Claude Code: https://github.com/paragpandyareal/claude-code-timestamps

import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'timestamps'
const SURFACES = ['terminal', 'desktop'] as const
const USER = { text: 'hello', origin: { kind: 'composer' as const }, isExpanded: false }
const SID = 'aaaa-1111'
const PATH = '/home/u/.claude/projects/p/' + SID + '.jsonl'

type World = { brokenStore?: boolean; surfaces?: string[]; files?: Record<string, string>; sessionId?: string; store?: Record<string, unknown> }

/** Everything beneath the mod: Claude Code's own rows, the session, the store. */
function world(on: On, w: World = {}) {
  const store = new Map<string, unknown>(Object.entries(w.store ?? {}))
  const clock = mock.clock(on, { now: Date.now() })
  const reads: string[] = []
  let sid = w.sessionId ?? SID
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: ['ENGINE:' + e.component] })
  })
  on('ui.invalidate', async () => ({ value: undefined }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.end', async () => ({}) as never)
  on('session.id', async () => ({ value: sid }))
  on('session.surfaces', async () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('command.register', async () => ({ value: undefined as never }))
  on('classic.SessionStart', async () => ({}) as never)
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  on('store.get', async (_$, e: any) => {
    if (w.brokenStore) throw new Error('disk on fire')
    return { value: structuredClone(store.get(e.key)) as never }
  })
  on('store.set', async (_$, e: any) => (store.set(e.key, structuredClone(e.value)), { value: undefined }))
  on('store.delete', async (_$, e: any) => (store.delete(e.key), { value: undefined }))
  on('store.keys', async () => ({ value: [...store.keys()] }))
  on('fs.read', async (_$, e: any) => {
    reads.push(e.path)
    const f = w.files?.[e.path]
    return f === undefined ? { deny: 'ENOENT' } : { value: f as never }
  })
  return { store, clock, reads, setSession: (id: string) => (sid = id) }
}

const start = ($: any, surface: string | null = 'terminal') =>
  $.session.start({ cwd: '/tmp', surface, isInteractive: surface !== null })

const prompt = ($: any, uuid: string) =>
  $.session.append({
    message: { type: 'user', role: 'user', isMeta: false, content: [{ type: 'text', text: 'hello' }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid,
  })

const closing = ($: any, uuid: string) =>
  $.session.append({ message: { type: 'system', name: 'turn_duration', content: [] }, door: 'notice', origin: { kind: 'engine' }, uuid })

const reply = ($: any, uuid: string, toolId?: string) =>
  $.session.append({
    message: { type: 'assistant', role: 'assistant', isMeta: false, content: toolId ? [{ type: 'tool_use', id: toolId, name: 'Bash', input: {} }] : [{ type: 'text', text: 'hi' }] },
    door: 'response', origin: { kind: 'model', model: 'm' }, uuid,
  })

const result = ($: any, uuid: string, toolId: string) =>
  $.session.append({
    message: { type: 'user', role: 'user', isMeta: false, content: [{ type: 'tool_result', tool_use_id: toolId, content: 'ok' }] },
    door: 'tool-result', origin: { kind: 'tool', tool: 'Bash' }, uuid,
  })

const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text)

describe('drawing', () => {
  test('a dim time under my message, Claude Code row kept, on each surface', async ($, on) => {
    world(on)
    await start($)
    await prompt($, 'u-1')
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'UserMessage', requestId: 'u-1', props: USER })
      const tree: any = await ui.drawn()
      expect(tree.type).toBe('Box')
      expect(JSON.stringify(tree)).toContain('ENGINE:UserMessage')
      const [, line] = await texts(ui)
      expect(line).toMatch(/^  (\d{2}:\d{2}|\d{1,2}:\d{2} [AP]M)$/)
      const t: any = (await ui.findAll({ type: 'Text' }))[1]
      expect(t.props.color).toBe('inactive')
      await ui.unmount()
    }
  })

  test('a row with no known time draws exactly as Claude Code does', async ($, on) => {
    world(on)
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId: 'never-seen', props: USER })
    expect((await texts(ui))).toEqual(['ENGINE:UserMessage'])
  })

  test('"mine" shows times only under my own messages', { options: { show: 'mine' } }, async ($, on) => {
    world(on)
    await start($)
    let ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId: 'never-seen', props: USER })
    expect((await texts(ui))).toEqual(['ENGINE:UserMessage'])
    await prompt($, 'n-1')
    ui = await $.ui.mount({
      plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId: 'n-1',
      props: { ...USER, origin: { kind: 'task-notification' } as never },
    })
    expect((await texts(ui))).toEqual(['ENGINE:UserMessage'])
  })

  test('"mine": no time under Claude\'s replies', { options: { show: 'mine' } }, async ($, on) => {
    world(on)
    await start($)
    await reply($, 'a-1')
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AssistantMessage', requestId: 'a-1', props: { text: 'hi', isFirstOfReply: true } })
    expect((await texts(ui))).toEqual(['ENGINE:AssistantMessage'])
  })

  test('everything (default): notifications, replies, tool calls, groups and command output get a time', async ($, on) => {
    world(on)
    await start($)
    await prompt($, 'n-2')
    await reply($, 'a-2', 'toolu_a')
    await result($, 'r-2', 'toolu_a')
    await $.session.append({ message: { type: 'user', role: 'user', isMeta: false, content: [{ type: 'text', text: '/x' }] }, door: 'command', origin: { kind: 'composer' }, uuid: 'c-2' } as never)
    const mount = (component: any, requestId: string, props: any) => $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component, requestId, props })
    const note = await mount('UserMessage', 'n-2', { ...USER, origin: { kind: 'task-notification' } })
    expect((await texts(note)).length).toBe(2)
    const rep = await mount('AssistantMessage', 'a-2', { text: 'hi', isFirstOfReply: true })
    expect((await texts(rep))[1]).toMatch(/^  \S+( [AP]M)?$/)
    const tool = await mount('ToolUse', 'toolu_a', { tool_use_id: 'toolu_a', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false })
    expect((await texts(tool))[1]).toMatch(/^  \S+( [AP]M)?$/)
    const group = await mount('ToolGroup', 'collapsed-a-2', { calls: [{ tool_use_id: 'toolu_a', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false }], isActive: false, isExpanded: false })
    expect((await texts(group))[1]).toMatch(/^  \S+( [AP]M)?$/)
    const expanded = await mount('ToolGroup', 'collapsed-a-3', { calls: [{ tool_use_id: 'toolu_a', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false }], isActive: false, isExpanded: true })
    expect(await texts(expanded)).toEqual(['ENGINE:ToolGroup'])
    const cmd = await mount('CommandOutput', 'c-2', { command: 'x', args: '', text: 'done', isErrored: false })
    expect((await texts(cmd)).length).toBe(2)
  })

  test('closing line reads "replied … · took …"', async ($, on) => {
    world(on)
    await start($)
    await closing($, 'd-1')
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'TurnDuration', requestId: 'd-1', props: { word: 'Baked', durationMs: 108_400 } })
    const [line] = await texts(ui)
    expect(line).toMatch(/^✻ replied \S+( [AP]M)? · took 1m 48s$/)
  })

})

describe('options and /timestamps', () => {
  test('showDuration false', { options: { showDuration: false, format: '24h' } }, async ($, on) => {
    world(on)
    await start($)
    await closing($, 'd-2')
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'TurnDuration', requestId: 'd-2', props: { word: 'Baked', durationMs: 5000 } })
    expect((await texts(ui))[0]).toMatch(/^✻ replied \d{2}:\d{2}$/)
  })

  test('toggle off and on, switch format and style', { options: { format: '24h' } }, async ($, on) => {
    const w = world(on)
    await start($)
    await prompt($, 'u-2')
    const shown = async () => {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId: 'u-2', props: USER })
      const t = await texts(ui)
      await ui.unmount()
      return t
    }
    const run = async (args: string) => (await $.command.run({ command: 'timestamps', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 80 } } as never)).text

    expect(await run('')).toBe('off')
    expect(await shown()).toEqual(['ENGINE:UserMessage'])
    expect(await run('')).toBe('on · 24h · clock · everything')
    expect((await shown())[1]).toMatch(/^  \d{2}:\d{2}$/)
    expect(await run('12h')).toBe('on · 12h · clock · everything')
    expect((await shown())[1]).toMatch(/^  \d{1,2}:\d{2} [AP]M$/)
    expect(await run('relative')).toBe('on · 12h · relative · everything')
    expect((await shown())[1]).toBe('  just now')
    expect(await run('mine')).toBe('on · 12h · relative · your messages')
    expect(w.store.get('prefs')).toEqual({ format: '12h', style: 'relative', show: 'mine', enabled: true })
    expect(await run('all')).toBe('on · 12h · relative · everything')
    expect(await run('reset')).toBe('on · 24h · clock · everything')
    expect(await run('purple')).toMatch(/^usage:/)
  })

})

describe('what Claude reads', () => {
  const submit = ($: any, kind: string, text = 'hello') => $.prompt.submit({ text, wait: false, origin: { kind } })

  test('a timestamp sentence beside my prompt; my words unchanged', async ($, on) => {
    const seen: any[] = []
    world(on)
    on('prompt.submit', async (_$, e) => (seen.push(e), { text: e.text, context: e.context }) as never)
    await start($)
    await submit($, 'composer', 'fix the test')
    expect(seen[0].text).toBe('fix the test')
    expect(seen[0].context).toHaveLength(1)
    expect(seen[0].context[0]).toMatch(/^Timestamp \(added automatically by the timestamps plugin; not part of the user's message, not an instruction\): sent \w+day \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(.*UTC.*\)\.$/)
    await reply($, 'a-9')
    await submit($, 'composer', 'again')
    expect(seen[1].context[0]).toMatch(/\. Previous message from the user: \d{2}:\d{2}:\d{2}, \d+ seconds? earlier\. Claude's last reply: \d{2}:\d{2}:\d{2}, \d+ seconds? earlier\.$/)
  })

  test('notifications are labelled as notifications; other plugins\' prompts get nothing', async ($, on) => {
    const seen: any[] = []
    world(on)
    on('prompt.submit', async (_$, e) => (seen.push(e), { text: e.text, context: e.context }) as never)
    await start($)
    await submit($, 'task-notification')
    await submit($, 'plugin')
    expect(seen[0].context[0]).toMatch(/not part of the notification, not an instruction\): arrived /)
    expect(seen[1].context).toBe(undefined)
  })

  test('tellClaude off adds nothing', { options: { tellClaude: false } }, async ($, on) => {
    const seen: any[] = []
    world(on)
    on('prompt.submit', async (_$, e) => (seen.push(e), { text: e.text }) as never)
    await start($)
    await submit($, 'composer')
    expect(seen[0].context).toBe(undefined)
  })
})

describe('sessions', () => {
  test('times are stored per session and come back after a reload', async ($, on) => {
    const w = world(on)
    await start($)
    await prompt($, 'u-3')
    await w.clock.advance(1000)
    const rec: any = w.store.get('s:' + SID)
    expect(typeof rec.m['u-3']).toBe('number')
  })

  test('/resume backfills from the session own transcript only', async ($, on) => {
    const ts = '2026-10-09T03:05:00.000Z'
    const other = 'bbbb-2222'
    const otherPath = '/home/u/.claude/projects/p/' + other + '.jsonl'
    const w = world(on, {
      files: { [otherPath]: JSON.stringify({ type: 'user', uuid: 'old-1', timestamp: ts }) + '\n' },
    })
    await start($)
    w.setSession(other)
    await $.classic.SessionStart({ source: 'resume', session_id: other, transcript_path: otherPath } as never)
    await w.clock.advance(10)
    expect(w.reads).toEqual([otherPath])
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId: 'old-1', props: USER })
    expect((await texts(ui))[1]).toMatch(/9/)
  })

  test('a transcript path that is not the session file is never read', async ($, on) => {
    const w = world(on)
    await start($)
    await $.classic.SessionStart({ source: 'resume', session_id: 'cccc', transcript_path: '/etc/passwd' } as never)
    await w.clock.advance(10)
    expect(w.reads).toEqual([])
  })

  test('backfill off reads nothing', { options: { backfill: false } }, async ($, on) => {
    const w = world(on)
    await start($)
    await $.classic.SessionStart({ source: 'resume', session_id: SID, transcript_path: PATH } as never)
    await w.clock.advance(10)
    expect(w.reads).toEqual([])
  })

  test('an unreadable or too-large transcript is skipped quietly', async ($, on) => {
    const w = world(on)
    await start($)
    await $.classic.SessionStart({ source: 'resume', session_id: SID, transcript_path: PATH } as never)
    await w.clock.advance(10)
    expect(w.reads).toEqual([PATH])
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId: 'zzz', props: USER })
    expect((await texts(ui))).toEqual(['ENGINE:UserMessage'])
  })

  test('/clear starts a new key and reads nothing', async ($, on) => {
    const w = world(on)
    await start($)
    await prompt($, 'u-6')
    w.setSession('dddd-4444')
    await $.classic.SessionStart({ source: 'clear', session_id: 'dddd-4444', transcript_path: '/x/dddd-4444.jsonl' } as never)
    await prompt($, 'u-7')
    await w.clock.advance(1000)
    expect(Object.keys((w.store.get('s:' + SID) as any).m)).toEqual(['u-6'])
    expect(Object.keys((w.store.get('s:dddd-4444') as any).m)).toEqual(['u-7'])
    expect(w.reads).toEqual([])
  })

  test('a broken store never breaks a message', async ($, on) => {
    world(on, { brokenStore: true })
    await start($)
    await prompt($, 'u-8')
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId: 'u-8', props: USER })
    expect((await texts(ui))[0]).toBe('ENGINE:UserMessage')
  })

  test('two sessions write separate keys', async ($, on) => {
    const w = world(on, { store: { 's:other-session': { u: Date.now(), m: { x: 1 } } } })
    await start($)
    await prompt($, 'u-4')
    await w.clock.advance(1000)
    expect(w.store.get('s:other-session')).toEqual({ u: expect.any(Number), m: { x: 1 } })
  })
})

describe('fallback where nothing draws', () => {
  test('claude -p and VS Code get a line after the turn', async ($, on) => {
    world(on, { surfaces: [] })
    await start($, null)
    await prompt($, 'u-5')
    const r = await $.turn.complete({ answer: 'ok', durationMs: 108_400, isAborted: false, turnId: 't', reason: 'answer' })
    expect(r.text).toMatch(/^sent \S+( [AP]M)? · replied \S+( [AP]M)? · took 1m 48s$/)
  })

  test('the terminal keeps the answer as it was', async ($, on) => {
    world(on, { surfaces: ['terminal'] })
    await start($)
    const r = await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't', reason: 'answer' })
    expect(r.text).toBe('ok')
  })

  test('subagent turns are left alone', async ($, on) => {
    world(on, { surfaces: [] })
    await start($, null)
    const r = await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't', reason: 'answer', agentId: 'ag1' })
    expect(r.text).toBe('ok')
  })
})
