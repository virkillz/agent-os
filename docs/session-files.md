# Session Files

Each agent's conversation history is persisted as JSONL files under `data/sessions/<agent-id>/`.

## File Format

Files are named `<ISO-timestamp>_<uuid>.jsonl`. With channel sessions, each conversation surface gets its own subdirectory:

```
data/sessions/9af349b2-e5c2-456c-94a0-c27348c31c95/
  a1b2c3d4-.../    ← channel session for web:dm:default
    2026-03-21T12-32-47-939Z_59426a77-141e-4326-aaa1-ba34dc672a84.jsonl
  e5f6g7h8-.../    ← channel session for slack:dm:C12345
    2026-03-21T12-39-39-928Z_77b45add-cfd8-45ce-bf1d-cf8152e15758.jsonl
```

For scheduler invocations (no channel session), files are written directly under `data/sessions/{agentId}/`.

Each file is one JSON object per line. The first line is always a session header:

```json
{"type":"session","version":3,"id":"...","timestamp":"...","cwd":"..."}
```

Subsequent lines are session entries. Every entry has `id` and `parentId` fields, forming a **tree** (not a flat list). This allows branching when a user edits an earlier message.

Entry types:

| type | Description |
|---|---|
| `message` | A user, assistant, or tool message |
| `compaction` | A summary of older context (see below) |
| `branch_summary` | Summary of the abandoned path when branching |
| `model_change` | Model switch mid-session |
| `thinking_level_change` | Thinking level switch mid-session |
| `custom` / `custom_message` | Extension-specific data |
| `session_info` | User-defined session name |
| `label` | User bookmark on an entry |

## When Files Are Created

A new `.jsonl` file is created each time a new session is started via `createLiveSession()`. This happens when:

- **First message to a channel** (Web UI, Slack DM, Telegram DM, etc.) that has no active `channel_sessions` row — `chatWithChannel()` creates a new channel session row and a new on-disk directory.
- **After an agent error** — the failed session is evicted from `liveSessions`, so the next message starts a new file.
- **After an explicit `endAndClearChannelSession()` call** — ends the DB row and evicts the live session; the next message creates a new row and directory.
- **After `clearSession()`** — evicts all live sessions for the agent from memory (but does not end DB rows); the next message reloads from disk.
- **Scheduler invocations** — these go through `invokeAgent()` which creates a fresh isolated session per run, never kept in `liveSessions`. The file is written directly under `data/sessions/{agentId}/` (no channel subdirectory).

There is no automatic session continuation on server restart. Each restart means the next message will create a new file. Previous files are retained on disk indefinitely.

## Write Strategy (Lazy Flush)

The SDK buffers writes until the agent has responded at least once:

1. User message arrives → stored in memory only.
2. First assistant reply → header + all buffered entries are flushed to disk in one write.
3. Every subsequent entry → appended to the file immediately via `appendFileSync`.

This means a `.jsonl` file only appears on disk after the agent's first response in that session.

## Long Session Handling (Compaction)

When the conversation grows large enough to approach context limits, the SDK automatically compacts:

1. A summary of the older portion of the conversation is generated.
2. A `compaction` entry is appended to the file:
   ```json
   {"type":"compaction","summary":"...","firstKeptEntryId":"abc12345","tokensBefore":85000,...}
   ```
3. When building the context sent to the LLM (`buildSessionContext`), only this path is used:
   - The compaction summary text (as a synthetic message)
   - Messages from `firstKeptEntryId` onward
   - All messages after the compaction point

**Old messages are never deleted from the file.** The file grows unboundedly; compaction only changes what the LLM sees, not what is stored.

## Branching

If a user edits an earlier message, the SDK moves the "leaf" pointer back to that entry and continues from there. A `branch_summary` entry is appended capturing what was discarded. The single `.jsonl` file then contains multiple conversation paths as a tree. Only the path from root to the current leaf is sent to the LLM.

## Relevant Code

- **Session creation**: `createLiveSession()` in `packages/server/src/agent-runner.ts` — calls `SessionManager.create(dataDir, sessionsDir)`.
- **Channel session lookup/creation**: `chatWithChannel()` in the same file — finds or creates `channel_sessions` rows and their on-disk directories.
- **Session eviction (memory only)**: `clearSession()` in the same file removes all sessions for an agent from `liveSessions` without ending DB rows.
- **Channel session reset**: `endAndClearChannelSession()` ends a specific `channel_sessions` row and evicts its live session.
- **Scheduler sessions**: `invokeAgent()` → `runScheduledTask()` creates a fresh isolated session per invocation.
- **SDK implementation**: `node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.js`.
