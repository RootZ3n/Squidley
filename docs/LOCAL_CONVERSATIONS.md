# Local Colloquium Conversations

Peh saves Colloquium chat history locally in your browser. There is
no account, no cloud sync, and no upload step.

## Where It Is Stored

Colloquium uses browser `localStorage` for this first public pass. The stored
record is small and versioned under:

```text
peh.colloquium.sessions.v2
```

Older single-chat records under `peh.colloquium.conversation.v1` are
adapted into the first local session when Colloquium opens.

Each local session stores:

- session id
- title
- created and updated timestamps
- messages
- recent visible receipts
- message metrics when available
- local-only metadata such as:

- `provider: local`
- `localOnly: true`
- `cloudUsed: false`
- `toolsUsed: false`

If the saved data is corrupt or from an unsupported version, Peh ignores it
and starts with a fresh chat instead of crashing.

## Multiple Local Chats

Use **New chat** in Colloquium to create another local session. This does not
delete previous sessions and does not reset the welcome screen or guided tour.

The session switcher restores a saved local chat from this browser. It shows the
session title and a compact updated date. There is no server sync.

New sessions start as **New chat**. After the first user message, Peh
automatically titles the session from that message using a short safe truncation.

## Restore Behavior

When Colloquium opens, it restores the active saved session from this browser
only. It does not auto-send anything and it does not restart incomplete streams.

If a page was closed while a local reply was still streaming, Peh removes
empty assistant placeholders. If partial assistant text was already saved, it is
marked as interrupted when restored.

## Clear and Delete

The **Clear chat** button removes messages and receipts from the current session
only. The session remains in the switcher. It asks for confirmation first:

```text
This only clears the chat saved in this browser.
```

The **Delete chat** button deletes the current session. It asks:

```text
This only deletes the chat saved in this browser.
```

If the last session is deleted, Peh creates a fresh empty local session.

Clear Chat does not reset the welcome screen, first-run choice, or guided tour
state.

To remove every local chat session, open **Settings** and use **Clear all local
chats**. That control only clears Colloquium chats saved in this browser.

## Export Chat

The **Export chat** button creates a local `.txt` file in the browser. Nothing is
uploaded. The export begins with:

```text
Peh Public Colloquium Export
exportedAt: ...
localOnly: true
cloudUsed: false
```

The export includes the visible messages and recent receipt summaries for the
current session.

## Settings

The Settings page includes:

- Restart tour.
- Reset welcome / first-run state.
- Clear all local chats.
- Read-only local model endpoint and configured model info.
- A local-only explanation.

It does not add accounts, sync, cloud unlock, or remote storage.

## What This Does Not Do

- No cloud sync.
- No accounts or authentication.
- No backend database.
- No shared-device privacy controls beyond the browser's own local storage.
- No automatic model calls during restore.
