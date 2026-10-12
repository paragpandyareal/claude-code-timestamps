# Security policy

## Supported versions

Only the latest release gets fixes.

## Reporting a vulnerability

Please report it privately. On GitHub, open this repository's **Security** tab and choose **Report a vulnerability**. Please don't open a public issue. You'll get a reply within 7 days.

## Threat model

**Trust boundary.** Timestamps is a Claude Code mod. It runs inside Claude Code with your user account's permissions, outside Claude Code's sandbox. Claude Code's permission rules don't govern the mod's own calls. That is why it keeps them to the few it needs. The README's [Permissions and data](README.md#permissions-and-data) section lists each one.

**What it treats as untrusted:** the transcript file it reads, the values in its own store (another version, or a person, may have edited them), and every row of the conversation. None of them ever reaches the note Claude reads.

| Risk | Mitigation |
|---|---|
| **Reading files it shouldn't** | One `fs.read`, of one file: the transcript path Claude Code hands the `SessionStart` hook for this session, and only when the file name is exactly `<session id>.jsonl` and the id is letters, digits and dashes. A path stored from an earlier session is checked the same way before it's read. Nothing from a transcript is shown except times. |
| **Writing files** | None. The only writes are its own entries in Claude Code's plugin store. |
| **Blocking or changing your work** | Every hook observes and passes its event on unchanged. None answers a tool call, a prompt or a conversation row in place of Claude Code, and each has a `.catch` that passes the event on if the hook throws or runs out of time. Slow work (saving, reading a transcript, pruning) runs on a timer after the hook has returned. |
| **Changing what Claude reads** | One thing only: a timestamp note added beside each prompt as `context`, never in your words. It's built from the clock, the system time zone and the previous prompt's time alone, it's labelled as a timestamp from this plugin and not the user's, and its wording is fixed and shown in the README. It's skipped for prompts other plugins send and can be turned off (`tellClaude`). The drawn times and the rewritten closing line change the screen only. The fallback line (where nothing is drawn) is a notice Claude Code shows under the answer; the answer itself is never rewritten. |
| **A large or hostile transcript** | Claude Code refuses reads over 4 MiB, and the mod then reads nothing. Each line is parsed on its own; lines that don't parse, or have no id or valid time, are skipped. Only ids, types and times are taken. |
| **A corrupted or edited store** | Every value read back is checked for shape and type; anything unexpected is ignored. |
| **Filling the store** | At most 5,000 rows per session, 200 sessions, 90 days and 2 MiB in all; the oldest go first. |
| **Prompt injection through the note** | Not possible from outside: the note holds only numbers from the clock, the time zone name the system reports, a gap worked out from the previous prompt's time, and fixed words. Nothing from a message, a file or another plugin is ever put in it. |
| **Prompt injection through the note** | Not possible from outside: the note holds only numbers from the clock, the time zone name the system reports, a gap worked out from the previous prompt's time, and fixed words. Nothing from a message, a file or another plugin is ever put in it. |
| **Terminal escape injection** | The mod draws only times and fixed words it builds itself, never text from a message or a file. |
| **Another plugin driving `/timestamps`** | The command only changes how times are shown. It reads and writes nothing else. |

**Environment variables.** None.

**Known limits:**
- The saved times are as private as Claude Code's plugin store: anyone who can read `~/.claude/plugins/store/` can read the ids and times (not the messages).

**Out of scope:** Claude Code itself, Anthropic's API, and what Claude does with your prompts.
