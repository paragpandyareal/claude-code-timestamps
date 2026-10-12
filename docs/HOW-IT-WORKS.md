# How Timestamps works

Timestamps is a Claude Code **mod**: a plugin made of function hooks (TypeScript that runs inside Claude Code). It notes the time each row of the conversation is stored, keeps those times by row id, draws them where Claude Code draws the row, and adds a timestamp note beside each prompt so Claude knows the time.

## The loop

```
 you press Enter ──► prompt.submit ──► context += "Timestamp (…): sent Monday 2026-10-12 14:05 (…). Previous message …"
                 ──► session.append (door "prompt", row id u-1) ──► times[u-1] = now
                                                                      │
 Claude Code draws your message ──► ui.render UserMessage (requestId u-1)
                                     └─► Claude Code's own row + dim "  14:05"
     │
 Claude works: session.append for each reply block (row id), tool_use (its id), tool_result ("r:" + id)
     │          ──► ui.render AssistantMessage / ToolUse / ToolGroup / CommandOutput ──► row + dim "  14:05 · took 3s"
     │
 turn ends ──► turn.complete ──► (only where nothing draws) "sent … · replied … · took …"
     │
           ──► session.append (door "notice", name "turn_duration", row id d-1) ──► times[d-1] = now
                                                                      │
 Claude Code draws "✻ Baked for 1m 48s" ──► ui.render TurnDuration (requestId d-1, durationMs)
                                     └─► "✻ replied 14:07 · took 1m 48s"
     │
 half a second later ──► store "s:<session id>" = { u, p: transcript path, m: { u-1: t, d-1: t } }
```

The key fact: **the `requestId` a message row is drawn under is the same id `session.append` hands its row**, and the same `uuid` the transcript file stores. That's what lets one map serve the live session, the store, and the transcript backfill. The first drawing of a prompt happens under the id `placeholder`, before the row is stored; the mod shows the current time there so the line doesn't appear a moment later and move the rows below.

The only thing Claude reads from the mod is the note added at `prompt.submit`. The rest is drawing.

## Files

| File | What it does |
|---|---|
| `hooks/register.ts` | **Everything that touches `$`:** the hooks, the store, the transcript read, timers, `/timestamps`, the drawing. A mod may hand `$` only to functions declared in the same file, so these all live here. |
| `hooks/format.ts` | **Pure:** `14:05` / `2:05 PM`, `5m ago`, `Mon 9 Oct, 14:05`, `1m 48s`, the closing line, tool lines, the system's 12h/24h choice, time to midnight, and Claude's note (`modelNote`: ISO-style local date and time, zone, UTC offset, labelled gaps) |
| `hooks/store.ts` | **Pure:** the store's keys and shapes, reading them back safely, the per-session cap, and which sessions to prune |
| `hooks/transcript.ts` | **Pure:** is this path this session's own transcript, and the times in a transcript's JSONL (rows, tool calls, tool results, last prompt, last reply) |
| `tests/format.test.ts`, `tests/store.test.ts` | The pure modules |
| `tests/mod.test.ts` | The mod through Claude Code's test kit: drawing on terminal and desktop, everything and mine, the command, options, the note Claude reads, `/resume`, `/clear`, a broken store, two sessions, the fallback, subagents |

## What's kept

`~/.claude/plugins/store/timestamps_<…>.json` (Claude Code's plugin store):

- `prefs`: `{ enabled?, format?, style?, show? }`, what `/timestamps` last set; each field overrides the matching option.
- `s:<session id>`: `{ u: last saved, p: transcript path, lu: last prompt, lr: last reply, m: { row id: epoch ms } }`. Row ids are message uuids, tool_use ids, and `r:<tool_use id>` for a tool's result. One key per session, so two sessions running at once never write the same key.

Pruning (5 s after a session starts): drop entries older than 90 days, then keep the newest while there are at most 200 and they add up to at most 2 MiB of JSON. The live session is always kept. A session keeps at most its newest 5,000 rows.

## Filling in older messages

- `classic.SessionStart` is the only place a mod is told the transcript path (`transcript_path`), beside `session_id`. The path is checked to end in `/<session id>.jsonl`, then saved in the session's entry, so a reload (which fires `session.start` but no `classic.SessionStart`) can find it again.
- On `resume` and `fork` (`/branch`), and on a reload, `$.clock.after(0, …)` reads the file once (so the hook returns at once), keeps each user row, `turn_duration` system row and (with tool-call times) tool_use id, and adds any id not already known. A read over 4 MiB rejects; the mod then does nothing.
- `$.session.messages()` was the first idea, but its rows carry no ids or times in this build, so it can't be used for this.

## The note Claude reads

- `prompt.submit` returns `next({ ...e, context: [...(e.context ?? []), note] })`: Claude Code sends each `context` entry as a block after the prompt, which the model reads and the transcript doesn't show. `e.text` is never touched.
- The note is built by `modelNote` from `Date.now()`, `Intl…resolvedOptions().timeZone` and `getTimezoneOffset()`, and two times the mod keeps: the last prompt (`lu`) and Claude's last reply (`lr`), which survive `/resume` through the store and the transcript.
- Wording rules, so it can't be mistaken for the user's words or an instruction: it opens with `Timestamp (added automatically by the timestamps plugin; not part of the user's message, not an instruction):`; the date is `Monday 2026-10-12`; the time is 24-hour with seconds; the zone and offset are spelled out; each earlier event is named, with its own time and the gap (`Previous message from the user: 11:01:15, 3 hours 3 minutes earlier. Claude's last reply: …`). Two lessons from live tests: with one unnamed gap, Claude read the gap since its own reply as the gap since the user's message; and with gaps rounded to minutes (`less than a minute`), Claude saw the minute change on the clock and hedged. Named events with seconds fixed both.
- Skipped when `origin.kind` is `plugin`, and when `tellClaude` is off. Slash commands don't reach `prompt.submit`.

## Surfaces

- `session.start`'s `e.surface` and `$.session.surfaces()` say whether the terminal or the Desktop app is drawing. Where neither is (a `-p` run, the SDK, the VS Code chat panel), the `turn.complete` hook returns the answer's `{ text }` with a line of its own, which Claude Code shows as a notice under the answer. In a `-p` text run, stdout stays the answer alone.
- `TurnDuration` (the closing line) is raised on the terminal only.

## Tool calls

- A collapsed group (`ToolGroup`, requestId `collapsed-…`) lists its calls' `tool_use_id`s. Its line is the first call's time and, once the results are in, how long from the first call to the last result. An expanded group is left alone: each call is then its own `ToolUse` row, with its own line.

## Redraws

- In relative style, `$.clock.every(60 s)` calls `$.ui.invalidate('ui.render')`.
- In clock style, one `$.clock.after` fires just after local midnight, so yesterday's rows gain their date, and schedules the next.
- `/timestamps` and a finished backfill invalidate once. Nothing else redraws.

## Developing

```bash
claude --plugin-dir /path/to/claude-code-timestamps   # hot-reloads as you save
claude plugin validate --strict .
claude plugin test .
node <typescript>/bin/tsc --noEmit -p .          # once Claude Code has written .claude-plugin/types/
```

Gotchas:
- **`$` only goes into functions declared in the same file**, at the top level. A closure inside `register` that takes `$` fails validation.
- **The test kit answers nothing by default.** Each `$` call a test reaches needs a hook beneath the plugin, answering `{ value }` (see `world()` in `tests/mod.test.ts`).
- **`prompt.submit` carries no row id.** `session.append` does, so times are recorded there.
- **In tmux, an Enter sent right after typed text can be swallowed** while a turn is running. Send `C-m` a moment later when driving a live session.
