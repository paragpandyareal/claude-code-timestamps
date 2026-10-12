# Changelog

## 0.4.0 (2026-10-12)

- **Telling Claude the time is now off by default.** Out of the box, the mod adds nothing to what Claude reads. Turn it on with the new `/timestamps claude on` (or the *Tell Claude the time* option); `/timestamps claude off` turns it off. **When on, it costs about 22 tokens per prompt**, and the README, the option, and the command's reply all say so.
- `/timestamps` status now ends with whether Claude is told the time.

## 0.3.0 (2026-10-12)

- **A much shorter note for Claude: about 22 tokens a prompt instead of about 80** (20 prompts: about 450 tokens instead of 1,600). It now reads `Timestamp (timestamps plugin, not the user): Mon 2026-10-12 17:21:03 +11:00.`
- Your time zone's name is sent once per session (and again after compaction), not on every prompt.
- The gap since your previous message is added only when it's 10 minutes or more (`3h 16m after the user's previous message.`). The gap since Claude's last reply is gone.
- Checked live: Claude still answers the time and the gap exactly, and says the plugin added the line.

## 0.2.0 (2026-10-12)

- **Times on everything.** A dim time under each block of Claude's reply, each tool call and collapsed group of calls (with how long they took: `14:05 · took 3s`), command output, and notifications. New option *Where times appear* (`show`: `everything`, the default, or `mine`) and `/timestamps all` / `/timestamps mine`. Replaces the `showOnToolCalls` option.
- **Claude knows the time.** Each prompt now carries one timestamp note that only Claude reads: the date with its weekday, the 24-hour time with seconds, your time zone and UTC offset, and when your previous message and Claude's last reply were, each with the gap. It's labelled as an automatic timestamp, not part of your message and not an instruction. Your words are never changed. New option *Tell Claude the time* (`tellClaude`, on).
- Backfill now also fills in Claude's reply blocks, tool calls and tool results, and the gaps for Claude's note.
- Durations over a day read `1d 2h`.

## 0.2.0 (2026-10-12)

- **Times on everything.** A dim time under each block of Claude's reply, each tool call and collapsed group of calls (with how long they took: `14:05 · took 3s`), command output, and notifications. New option *Where times appear* (`show`: `everything`, the default, or `mine`) and `/timestamps all` / `/timestamps mine`. Replaces the `showOnToolCalls` option.
- **Claude knows the time.** Each prompt now carries one timestamp note that only Claude reads: the date with its weekday, the 24-hour time with seconds, your time zone and UTC offset, and when your previous message and Claude's last reply were, each with the gap. It's labelled as an automatic timestamp, not part of your message and not an instruction. Your words are never changed. New option *Tell Claude the time* (`tellClaude`, on).
- Backfill now also fills in Claude's reply blocks, tool calls and tool results, and the gaps for Claude's note.
- Durations over a day read `1d 2h`.

## 0.1.0 (2026-10-12)

First version.

- **A dim time under each of your messages:** `14:05` today, `Mon 9 Oct, 14:05` on an older day, with the year in another year. Claude Code still draws the message itself, so text wraps exactly as before.
- **The turn's closing line becomes `✻ replied 14:07 · took 1m 48s`.** Nothing extra under Claude's replies.
- **`/timestamps`:** on and off, `12h` / `24h`, `clock` / `relative`, `reset`. Remembered across sessions.
- **Options:** hour format (follows your locale by default), style, turn duration, times on tool calls, filling in older messages.
- **Times last:** kept per session in Claude Code's plugin store (ids and times only), through `/resume`, `/branch`, `/clear`, compaction, reloads and two sessions at once. Old sessions are pruned to stay under 2 MiB.
- **Older messages:** on `/resume` and `/branch`, times for messages from before the mod loaded come from the session's own transcript file. Over 4 MB, they're skipped quietly.
- **Relative times** count up once a minute; clock times redraw once at midnight so yesterday's messages gain their date.
- **Where nothing is drawn** (`claude -p`, the VS Code chat panel): one line after each turn, `sent 14:05 · replied 14:07 · took 1m 48s`. Plain `claude -p` output is unchanged.
- Nothing to install. No network, no programs, no files written.
