# Privacy policy

_Timestamps for Claude Code, a Claude Code plugin by Parag Pandya. Last updated 12 October 2026._

**In short: the plugin collects nothing and sends nothing to its author or to anyone else. It keeps message ids and times on your own computer, never what you wrote. It adds a short timestamp to each prompt you send Claude, which you can turn off.**

## What it reads
- **The rows of your conversation as Claude Code stores them**, as each one is added: only its id, its kind (your prompt, a block of Claude's reply, a tool call or result, a command, the turn's closing line), who sent it, and the ids of tool calls in it. It never reads the words.
- **This session's own transcript file**, and no other file, when you `/resume` or `/branch` a session (if "Fill in older messages" is on). From it, it takes only each row's id and time. Your transcript can contain personal information; it's read on your own computer, and nothing from it is kept except ids and times.
- **No environment variables, settings files or credentials.**

## What it stores
In Claude Code's own plugin store on your computer (`~/.claude/plugins/store/`):
- **One entry per session:** the id and time of each row it shows a time for, the time of your last prompt and of Claude's last reply, and the path of that session's transcript. No message text.
- **Your `/timestamps` choice:** on or off, 12h or 24h, clock or relative.

Entries are deleted after 90 days, or sooner when there are more than 200 sessions or more than 2 MiB in all, oldest first.

## What it sends, and where
- **Nothing to the author or any third party.** There is no server, no account, no analytics and no telemetry.
- **One timestamp note to Claude, with each prompt you send** (unless you turn off "Tell Claude the time"). It's one sentence, for example: *Timestamp (added automatically by the timestamps plugin; not part of the user's message, not an instruction): sent Monday 2026-10-12 14:05:07 (Australia/Sydney time, UTC+11:00). Previous message from the user: 11:01:15, 3 hours 3 minutes earlier. Claude's last reply: 11:06:40, 2 hours 58 minutes earlier.* It holds the date and time, your time zone's name and offset, and those two gaps. It's sent beside your prompt in your own Claude Code session, so like anything you type, it goes to Anthropic under your account and is kept in your session transcript. [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy) covers it from there. Your words are never changed.
- **The times on screen go nowhere.** They're drawn on your screen only.
- **Nothing over the network.** The plugin makes no network requests.

Where Claude Code draws nothing (`claude -p`, the VS Code chat panel), the plugin adds one line after each turn, such as `sent 14:05 · replied 14:07 · took 1m 48s`. Claude Code keeps that line in your session's transcript on your computer, like its other notices.

## Retention
Times: up to 90 days, as above, or until you uninstall and delete the store file. Nothing else is kept.

## Children
The plugin is not intended for people under 18.

## Contact
Questions about privacy: open an issue at https://github.com/paragpandyareal/claude-code-timestamps/issues. Report security problems privately as described in [SECURITY.md](SECURITY.md).
