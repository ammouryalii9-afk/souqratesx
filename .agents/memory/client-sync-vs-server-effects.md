---
name: Client-authoritative sync vs server-applied effects
description: When a server-side event (e.g. IAP webhook) grants an effect into state that a debounced client autosync also writes, the client must refetch or the autosync clobbers the server change.
---

In games/apps where game state lives as a client-owned blob that gets periodically PUT to the server (client-authoritative sync), any server-initiated mutation of that same blob (e.g. a payment webhook granting an item, an admin panel edit, a moderation action) is fragile: the client's next debounced autosync will overwrite the server's change with its own stale in-memory copy, because the sync endpoint blindly replaces the whole blob.

**Why:** This caused a real bug — a Telegram Stars purchase deducted currency and the webhook correctly wrote the granted effect into the DB, but the effect never appeared in the UI because the client's autosync fired shortly after and overwrote it with pre-purchase local state.

**How to apply:** After any action that could complete asynchronously server-side while a client sync loop is running (payment webhooks, admin edits, moderation), have the client explicitly refetch canonical state and overwrite its local copy before/instead of letting the next autosync run. A short delay (~1-2s) before refetching is usually enough to let the webhook land. Longer-term, prefer merge/patch semantics for server-authoritative fields over full blob overwrite, but a refetch-after-action is a low-risk fix that doesn't require a sync protocol rewrite.
