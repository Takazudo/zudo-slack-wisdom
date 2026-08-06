# Read-only dashboard surfaces in Slack — ranked comparison

Scenario: a bot (e.g. a Cloudflare Worker cron mirroring an external database) periodically
publishes a status board into Slack. Humans should be able to *look* at it where they already
work; they should not be able to edit it. This compares the five surfaces a Slack bot can
write such a dashboard to, ranked for that goal.

All claims below were verified against Slack's primary documentation (docs.slack.dev,
slack.com/help) in August 2026, including live-API probes distinguishing real methods
(`not_authed` on an unauthenticated call) from nonexistent ones (`unknown_method`).

## Ranking at a glance

| # | Surface | Bot-writable | Inherently read-only | Refresh cost | Visual ceiling |
|---|---|---|---|---|---|
| 1 | Pinned `chat.update` Block Kit message | Yes | **Absolute** — only the author can edit | **1 API call** | Block Kit incl. Table block (100 rows) |
| 2 | Slack List (Board layout) | Yes (12 GA methods) | Configurable, server-enforced, with holes | Per-row create/update + owned row-id state | **Real Kanban board** — the only one |
| 3 | Channel bookmark → external dashboard | Yes (`bookmarks.add`) | Governed by your own app | **0** — dashboard is always fresh | Unlimited (your own UI) |
| 4 | Canvas | Yes | Configurable (`canvases.access.set`) | 1 call, but whole-document replace | Markdown document, tables only |
| 5 | App Home tab | Yes (`views.publish`) | Yes | **O(users)** calls per refresh | Full Block Kit, but per-user |

---

## 1. Pinned `chat.update` Block Kit message — build this first

**Bot-writable:** Yes. `chat.postMessage` once, pin it, then `chat.update` on every refresh.

**Inherently read-only:** Absolute, and it needs zero configuration. Per the docs, "Only
messages posted by the authenticated user can be updated" — there is no ACL to set, no share
dialog to get wrong, no admin override that grants someone else edit rights on the message
body. This is the only surface in the list whose read-only property cannot be misconfigured.
(https://docs.slack.dev/reference/methods/chat.update)

**Refresh cost:** Exactly **one API call per refresh**. Editing in place produces no channel
notification (correct behavior for a dashboard), and no "edited" flag is shown when the
message content is blocks.

**Visual ceiling:** Much higher than its reputation. The Block Kit **Table block** renders up
to **100 rows × 20 columns, 10,000 characters total**
(https://docs.slack.dev/reference/block-kit/blocks/table-block), alongside sections, context
lines, and the newer card/carousel-style blocks. What it cannot do: Kanban swimlanes,
per-row threads, filtering, CSV export.

**Hard limits:** Table block caps above; general Block Kit per-message block limits; any
channel member can unpin the message (unpinning does not delete it).

**Verdict: default choice.** One API call, no state to persist, no cap policy, no manual
setup, and the strongest read-only guarantee available. A Slack List delivers roughly 20%
more (a real board, per-item threads) for roughly 10× the code and operational surface. Ship
this first; upgrade only if the team asks for columns after seeing it.

---

## 2. Slack Lists — the only real board, and the longest bill

**Bot-writable:** Yes. The Lists Web API went GA on 2025-09-02: 12 `slackLists.*` methods,
all bot-token (`xoxb`) compatible with `lists:read` + `lists:write`
(https://docs.slack.dev/changelog/2025/09/02/list-api/,
https://docs.slack.dev/reference/scopes/lists.write/). Three prerequisites: a **paid plan**
(any paid tier — Pro/Business+/Enterprise; not Enterprise-only), the two scopes (adding them
forces an OAuth reinstall), and **per-list access** — scopes alone yield `list_not_found`
until the list is shared with the bot or its channel. First-party SDK bindings exist in
`@slack/web-api` >= 7.13.0 (https://github.com/slackapi/node-slack-sdk/pull/2421) and
`slack_sdk` >= 3.39.0; Zapier/Make/n8n have **no** native Lists support.

**Inherently read-only:** No — but genuinely configurable and server-enforced.
`slackLists.access.set` takes a **required** `access_level` of exactly `read` | `write` |
`owner`, and Slack ships a canned sample for this exact case:
`{"list_id":"F1234567","access_level":"read","channel_ids":["C7654321"]}`
(https://docs.slack.dev/reference/methods/slackLists.access.set/). Read-only is closed under
escalation: viewers can only re-share view access, never grant edit. Known holes, all
documented:

- **Viewers can still comment** in list items' threads — a list-specific carve-out, unlike
  canvases (https://slack.com/help/articles/15678967614611-Manage-access-permissions-for-canvases-and-lists).
- **Owners and admins can delete any list they can view.** No ACL prevents it.
- The **UI share dialog defaults to "Can edit"** — the API cannot fall into this (the param
  is required), but a human sharing by hand will hand out write unless they change the dropdown.
- Sharing an invite-only list into a **public** channel makes it visible workspace-wide.
- A Form workflow attached to a list inserts items regardless of access level — publish none.

**Refresh cost:** The highest here. There is **no upsert, no external-id, no idempotency
key** on any method — two identical `items.create` calls make two rows, so the caller must
persist the returned row id atomically with each create and branch create-vs-update on it
(https://docs.slack.dev/reference/methods/slackLists.items.create). `items.list` has no
filter/search (only `limit`/`cursor`/`archived`), so recovery from a lost mapping means
paginating the whole list. Text cells must be written as Block Kit `rich_text` structures —
plain strings are rejected. `items.update` runs at Tier 3 (50+/min); `items.create`'s tier is
contested (Tier 2 per docs, Tier 3 per SDK metadata — assume the stricter). Whether one
`items.update` call can carry cells for many rows is undocumented and is the difference
between a seconds-long and a minutes-long sync for a few hundred rows.

**Visual ceiling:** The only surface that renders an actual board. Board layout is a genuine
layout mode — "items are grouped by field, and you can move items between columns" — with
group-by, saved views, per-item threads, and item detail panes
(https://slack.com/help/articles/27452748828179-Use-lists-in-Slack). A view-only user gets a
look-but-don't-touch board: they can switch Board/Table, filter, open items, and read/post
thread comments, but cannot drag cards (that's a field write) or save views.

**Hard limits:**

- **1,000 items+subtasks per list** on Pro/Business+ (5,000 on Enterprise Grid); at the cap,
  **oldest-first auto-archive is reported but unverified** (research pass only — `over_row_maximum`
  on create is the only documented signal). Either way a monotonically growing source table
  cannot be mirrored wholesale; push only a bounded working set and delete finished rows.
- **Schema is effectively immutable**: `slackLists.update` accepts only
  `id`/`name`/`description_blocks`/`todo_mode` — no way to add/remove/retype columns via API
  (https://docs.slack.dev/reference/methods/slackLists.update). Column limit 30.
- **No `slackLists.info`, no list enumeration** — persist the `list_id` and every
  `column_id` yourself at create time or lose them.
- **Board layout / views are not API-settable**, and the default view is owner-only and
  UI-only — so a bot-created list needs a human granted `owner` or `write` to click the
  board into existence. One human holds write in every workable topology.
- **No Events API events for lists** — irrelevant for a read-only board (the bot is the sole
  writer), but it rules out cheap two-way sync (https://docs.slack.dev/reference/events/).
- Slack has pre-announced deprecation of the `key`/generic `value` response fields in favor
  of `column_id` + typed values — parse the latter from day one.
- Workspace admins can disable Lists entirely
  (https://slack.com/help/articles/28932867593875-Manage-list-settings-in-Slack).

**Verdict: adopt only if the team demands a board.** It is the sole surface with real
columns, and read-only mode eliminates the usual Lists dealbreaker (no change events). But
you pay with permanent row-id bookkeeping, a cap-eviction policy, an un-evolvable schema,
manual view setup a bot cannot perform, and a human co-owner in the loop.

---

## 3. Channel bookmark to an external dashboard — the null option; layer it under any winner

**Bot-writable:** Yes — `bookmarks.add` with `bookmarks:write` pins a link into the
channel's bookmark bar (https://docs.slack.dev/reference/methods/bookmarks.add).

**Inherently read-only:** The Slack side is just a link; your own dashboard's auth model
governs everything else.

**Refresh cost:** **Zero.** The dashboard renders live data; there is nothing to sync.

**Visual ceiling:** Unlimited — it is your own UI, which will always beat anything Slack can
render natively.

**Hard limits:** It is not *in* Slack: one click-through, plus whatever login friction your
dashboard imposes. Nothing is glanceable from the channel itself.

**Verdict: do this regardless of what else you build.** Zero cost, full fidelity, always
fresh. Its only weakness — not glanceable in-channel — is exactly what option 1 patches for
one API call.

---

## 4. Canvas — a document, not a dashboard

**Bot-writable:** Yes — `canvases.create` / `canvases.edit`.

**Inherently read-only:** Configurable via `canvases.access.set` with `read`
(https://docs.slack.dev/reference/methods/canvases.access.set). Stricter than Lists in one
respect: canvas viewers cannot comment at all. Setup is order-sensitive — the docs require
the canvas link be shared into the channel before access can be set.

**Refresh cost:** `canvases.edit` supports **one operation per API call**
(https://docs.slack.dev/reference/methods/canvases.edit), so the only sane refresh is a
whole-document `replace` — one call, but you regenerate and resend the full document every
time.

**Visual ceiling:** Markdown-flavored document: headings, tables, checklists. No board, no
columns, no widget layout.

**Hard limits:** One edit-op per call; document-shaped rendering only.

**Verdict: skip for dashboards.** Its single structural advantage over a pinned message —
a channel canvas is a persistent tab that never scrolls away — rarely justifies losing the
pinned message's one-call refresh and absolute read-only guarantee. Use Canvas for prose
runbooks, not status boards.

---

## 5. App Home — read-only, but nobody can share it

**Bot-writable:** Yes — `views.publish`
(https://docs.slack.dev/reference/methods/views.publish).

**Inherently read-only:** Yes — users cannot edit an app's Home tab. Technically the
cleanest read-only story after the pinned message.

**Refresh cost:** **O(users)** — App Home is "a one-to-one space shared by a user and an
app" (https://docs.slack.dev/surfaces/app-home/), so every refresh is one `views.publish`
per user, and you must track who those users are.

**Visual ceiling:** Full Block Kit, same as a message — but rendered privately per user.

**Hard limits:** No shareable link — you cannot post "look here" and point the team at it;
each person must navigate to the app's Home tab themselves.

**Verdict: worst fit for a shared team dashboard.** Per-user privacy is a feature for
personalized views and an anti-feature for "one board the whole channel looks at." Only
choose this when each viewer genuinely needs different data.

---

## Decision rule

**Do you want swimlanes, or do you want the numbers visible in Slack?** If the numbers:
pinned `chat.update` message (#1) plus a bookmark to the real dashboard (#3), and stop. If
the team genuinely works a pipeline as a board (e.g. stages A → B → C with cards moving
between them) and will keep doing so after the novelty fades: Slack Lists (#2), read-only,
with the bot as writer, a bounded working set under the 1,000-row cap, and one named human
holding write. Canvas and App Home lose to those three in every read-only-dashboard
scenario examined.

## Sources

- https://docs.slack.dev/reference/methods/chat.update
- https://docs.slack.dev/reference/block-kit/blocks/table-block
- https://docs.slack.dev/changelog/2025/09/02/list-api/
- https://docs.slack.dev/reference/methods/slackLists.access.set/
- https://docs.slack.dev/reference/methods/slackLists.items.create
- https://docs.slack.dev/reference/methods/slackLists.items.update
- https://docs.slack.dev/reference/methods/slackLists.items.list
- https://docs.slack.dev/reference/methods/slackLists.update
- https://docs.slack.dev/reference/scopes/lists.write/
- https://docs.slack.dev/reference/events/
- https://slack.com/help/articles/27452748828179-Use-lists-in-Slack
- https://slack.com/help/articles/15678967614611-Manage-access-permissions-for-canvases-and-lists
- https://slack.com/help/articles/28932867593875-Manage-list-settings-in-Slack
- https://docs.slack.dev/reference/methods/canvases.edit
- https://docs.slack.dev/reference/methods/canvases.access.set
- https://docs.slack.dev/reference/methods/views.publish
- https://docs.slack.dev/surfaces/app-home/
- https://docs.slack.dev/reference/methods/bookmarks.add
- https://github.com/slackapi/node-slack-sdk/pull/2421
