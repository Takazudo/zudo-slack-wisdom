# Slack Lists API — feasibility digest

Research digest on the Slack Lists (`slackLists.*`) Web API, compiled 2026-08-06 from a
multi-agent research + adversarial-verification pass. The motivating scenario was generic:
a Cloudflare Worker cron that mirrors rows from an external database into Slack and wants a
Slack-native Kanban board for them.

**Verification legend.** Facts marked **VERIFIED** survived an adversarial verification pass
(live API probes against `slack.com/api`, raw-HTML greps of primary docs with a soft-404
byte-size control, and unpacking published SDK artifacts from npm/PyPI). Facts marked
**UNVERIFIED** come from the research pass only (documented or reported, but not put through
that adversarial pass). The live-probe method: an unauthenticated POST to a real method
returns `not_authed` / `invalid_auth`, while a nonexistent method returns `unknown_method` —
so Slack's own dispatcher distinguishes "exists" from "doesn't". The docs control:
docs.slack.dev soft-404s with HTTP 200 serving a 43,392-byte SPA shell, so real pages were
confirmed by byte size and content grep, not status code.

---

## 1. The 12 methods — GA since 2025-09-02

**VERIFIED.** The Lists API went publicly available on 2025-09-02 — changelog
"Introducing the Lists API": <https://docs.slack.dev/changelog/2025/09/02/list-api/>
("The following API methods are now publicly available for interacting with Lists in
Slack!"). Exactly 12 methods, all under the `slackLists.*` namespace, no beta / waitlist /
experimental / partner-allowlist marker on any method or scope page (grepped raw HTML;
zero hits).

| Method | R/W | Rate tier | Notes |
|---|---|---|---|
| `slackLists.create` | write | not stated in brief | Creates a list with a full column `schema` (select / multi_select with colored choices, user, date, number, checkbox, rating, link, email, …). `todo_mode: true` adds completed/assignee/due-date columns. Returns `list_id` + `list_metadata` — capture `column_id`s here (see §4). Docs page verified real (438,909 B vs 43,392 B shell). <https://docs.slack.dev/reference/methods/slackLists.create/> |
| `slackLists.update` | write | not stated in brief | Update list metadata. |
| `slackLists.items.create` | write | conflicting: Tier 2 (docs) vs Tier 3 (Java SDK rate-limit metadata) — assume the stricter | Adds a row. `initial_fields` = array of `{column_id, <typed value>}`. `parent_item_id` makes a subtask. Live-probed: method exists. <https://docs.slack.dev/reference/methods/slackLists.items.create/> |
| `slackLists.items.update` | write | Tier 3 (50+/min) | Updates cells: `cells: [{row_id, column_id, …typed value}]`. Can also create a row via `row_id_to_create`. Live-probed: exists. |
| `slackLists.items.list` | read | Tier 2 (20+/min) | All rows, cursor-paginated (`limit` / `cursor` → `response_metadata.next_cursor`; also `archived?`). The only change-detection mechanism (see §5). Live-probed: exists. |
| `slackLists.items.info` | read | not stated in brief | One row plus full list metadata / schema / views / limits — the only schema-read path besides `create`'s response, and it requires an existing row id. |
| `slackLists.items.delete` | write | not stated in brief | Delete one row. |
| `slackLists.items.deleteMultiple` | write | Tier 2 (20+/min) | Delete many rows. |
| `slackLists.download.start` | read | not stated in brief | Kick off async bulk export (CSV or JSON) — better than paginating for full dumps. |
| `slackLists.download.get` | read | not stated in brief | Fetch the export. |
| `slackLists.access.set` | write | Tier 3 (50+/min) | Grant read/write/owner to users or channels. Takes `user_ids` **or** `channel_ids`, never both. |
| `slackLists.access.delete` | write | not stated in brief | Revoke access. |

Scope↔method mapping (**VERIFIED** from the scope pages): `lists:read` covers the four read
methods (`items.list`, `items.info`, `download.start`, `download.get`); `lists:write` covers
the other eight.

---

## 2. Scopes, tokens, plan gating

- **VERIFIED.** Scopes are exactly `lists:read` and `lists:write`; both support **Bot (xoxb)
  and User tokens**, with no restricted/sensitive/admin-approval marker.
  <https://docs.slack.dev/reference/scopes/lists.write/>
- **VERIFIED.** Paid plan required: every `slackLists.*` method page states verbatim "Lists
  are only available to Slack workspaces on a paid plan." All paid tiers qualify — Pro,
  Business+, Enterprise — this is **not** Enterprise-only. Slack's help center documents
  Lists management under both a "Free, Pro and Business+ subscriptions" tab and an
  "Enterprise subscriptions" tab.
  <https://slack.com/intl/en-gb/help/articles/28932867593875-Manage-list-settings-in-Slack>
- **VERIFIED.** On downgrade to Free, existing lists become read-only and new ones cannot be
  created.
- **VERIFIED.** Scopes are necessary but not sufficient: lists default to invite-only
  ("Only invited people can access"), so a correctly-scoped bot gets `list_not_found` until
  the list is shared with its bot user ID or a channel it belongs to (grant via
  `slackLists.access.set`).
- **VERIFIED.** An admin toggle can disable Lists workspace- or org-wide; a second toggle can
  restrict sharing to list owners only (which would block a bot from calling `access.set`).
- Adding the scopes to an existing app forces an OAuth **reinstall**. (From the research
  pass; standard Slack OAuth behavior.)
- **VERIFIED (token-type caveat).** An open bug reports `items.create` / `items.update`
  failing with Workflow Builder `xwfp` tokens — specific to xwfp, does not affect xoxb:
  <https://github.com/slackapi/deno-slack-sdk/issues/472> (still open as of 2026-08).
- **UNVERIFIED.** Whether a bot user ID is accepted in `access.set`'s `user_ids` is nowhere
  stated by Slack; the fallback is sharing the list into a channel the bot is in.

---

## 3. Verified absences — what the API does NOT have

All four below were checked, not merely found undocumented.

- **No list enumeration.** `slackLists.list` does not exist — **VERIFIED** by live probe
  (`unknown_method`). You cannot enumerate a workspace's lists; persist `list_id` yourself.
- **No standalone list-info/schema read.** `slackLists.info` does not exist — **VERIFIED**
  by live probe (`unknown_method`) plus soft-404 control on its would-be docs page (exact
  43,392-byte shell). Schema is only available from `slackLists.create`'s response or from
  `slackLists.items.info` (which needs an existing row id). **Store `list_id` and every
  `column_id` at creation time** — losing them means manual recovery via `items.info` on a
  known row.
- **No delete-a-whole-list method.** Verified absent from the 12-method surface.
- **No upsert / no external-ID key.** Nothing in the documented surface accepts a
  caller-supplied external key for idempotent writes; the closest thing is
  `items.update`'s `row_id_to_create`, which still requires you to track row ids yourself.
  (Absence from the documented method surface; not separately live-probed.)
- **No Events API event for list changes** — **VERIFIED**: the full event catalog at
  <https://docs.slack.dev/reference/events/> contains no `list_item_created` /
  `list_item_updated` or any list event. Socket Mode adds nothing. **Polling
  `slackLists.items.list` is the only reliable inbound path** — a human dragging a card
  emits nothing you can subscribe to.

Related write-side constraints:

- **VERIFIED.** Plain text is rejected in requests: text columns must be written as Block
  Kit `rich_text` blocks. The `text` property appears only in responses as a fallback.
- **VERIFIED (Slack's own words).** Declared schema instability: the docs say the `key`
  field property "will be deprecated in favor of `column_id`" and the generic `value` "will
  also be deprecated eventually in favor of typed values." Parse `column_id` + typed fields
  from day one.

---

## 4. Item caps and auto-archive

- **VERIFIED.** Per-list capacity: **1,000 items + subtasks on Pro and Business+**,
  **5,000 on Enterprise Grid** — quoted verbatim from Slack's help article "Use lists in
  Slack": <https://slack.com/help/articles/27452748828179-Use-lists-in-Slack>. Tier changes
  capacity, not access.
- **UNVERIFIED (research pass only).** At the cap, Slack auto-archives the **oldest** items.
  If a sync pushes a monotonically-growing table wholesale, Slack silently drops history —
  so a list can only hold a bounded working set, never a full mirror of a growing source
  database. Actively delete/archive terminal-state rows out of the list.

---

## 5. Board (Kanban) layout — real in the UI, absent from the API

- **VERIFIED.** Board layout is a genuine distinct layout mode, not a grouped table. Slack's
  help article documents two layouts: "table layout (organises items by rows and fields by
  columns) or board layout (items are grouped by field, and you can move items between
  columns)". Switch via the filters icon → Layout → Board/Table; a "Group by" control picks
  the column whose values become the board columns; layouts are savable as named, shareable
  Views. <https://slack.com/intl/en-gb/help/articles/27452748828179-Use-lists-in-Slack>
- **VERIFIED wording caveat.** Slack's own pages never say "drag" or "Kanban" — three locale
  renderings say only "move items between columns". Drag-and-drop was confirmed only by a
  third-party hands-on article (ClearFeed, 2026-05-07: "You can drag and drop items between
  these columns"), so treat the interaction detail as third-party-confirmed, not
  Slack-stated.
- **VERIFIED.** Board layout is **UI-only, not API-addressable**: `slackLists.create` takes
  only `name`, `description_blocks`, `schema`, `copy_from_list_id`,
  `include_copied_list_records`, `todo_mode` — no view/layout/board/group_by argument
  anywhere in the 12-method surface. The only API exposure of views is the read-side
  `views[]` in `slackLists.items.info`, whose documented example shows only types `record`
  and `table` — no board type. A human sets up the board once by hand.
- **UNVERIFIED.** Which column types can be grouped in Board layout is undocumented. A
  single-`select` status column (e.g. neutral pipeline stages A → B → C) is the type every
  Kanban example uses — confirm the board renders before committing.
- **UNVERIFIED.** Whether Workflow Builder's "When a list item is updated" trigger also
  fires on create is undocumented; there is no documented "created" trigger. (That trigger
  can post a channel message, giving a fragile first-party push path for change detection
  without polling — usable, but string-parsing-dependent; the research pass recommended not
  building on it.)

Practical consequence (analysis, not a Slack fact): with no change events, two-way sync
degrades to a polled reconciler — one `items.list` sweep per cron tick (~10 paginated calls
for 1,000 rows, well within Tier 2), diffed against the source database, with an explicit
conflict-resolution rule for rows changed on both sides. Keep the external database as the
system of record and push only a bounded active working set into the list.

---

## 6. SDK and no-code support

**VERIFIED** — established by unpacking published npm/PyPI artifacts and bisecting versions,
not by docs alone.

| SDK | Lists support since | Current status |
|---|---|---|
| `@slack/web-api` (Node) | **7.13.0** (2025-11-25, PR <https://github.com/slackapi/node-slack-sdk/pull/2421>) — 7.12.0 has zero bindings | All 12 methods bound on `client.slackLists.*` with typed Arguments/Response pairs; present in 8.0.0 (2026-07-14). Open cosmetic typing nit: <https://github.com/slackapi/node-slack-sdk/issues/2598> |
| `slack_sdk` (Python) | **3.39.0** (2025-11-20, PR slackapi/python-slack-sdk#1772) — 3.38.0 has zero | All 12 as `slackLists_*` on `WebClient`, `AsyncWebClient`, `LegacyWebClient`; present through 3.43.0 (2026-06-30) |
| `java-slack-sdk` | 1.48.0 (PR #1537, merged 2025-12-11) | Bound |
| Bolt (JS/Python) | Transitive | `@slack/bolt` 5.0.0 → `@slack/web-api` ^8.0.0; `slack_bolt` 1.30.0 → `slack_sdk` >=3.38.0 (resolves to Lists-capable versions) |
| `deno-slack-api` | **Not shipped** | <https://github.com/slackapi/deno-slack-api/issues/129> still open |

Older pins (`@slack/web-api` ≤7.12.0, `slack_sdk` ≤3.38.0) must fall back to the generic
`apiCall(methodName, options)` escape hatch, which Slack's docs explicitly sanction.

**No-code platforms — VERIFIED ABSENT (as of 2026-08-06).** None of Zapier, Make, or n8n
ships a native Slack Lists trigger/action/module:

- Zapier's Slack app enumerates its full trigger/action set (Canvas create/edit IS present)
  with no Lists entry; only the generic "API Request (Beta)" raw call works.
- Make's Slack module reference (updated 2026-08-05) has zero `slackLists` occurrences; only
  the generic "Make an API Call" module.
- n8n's Slack node resources stop at Channel / File / Message / Reaction / Star / User /
  UserGroup; zero `slackLists` hits across the n8n-io org (with a live-index control query).

---

## 7. Bottom line

The Lists API is real, GA, bot-token-friendly, and SDK-supported — full CRUD on items. The
hard limits are structural, not maturity issues: no change events (polling only), no list
enumeration or schema-read method (persist ids yourself), a hard per-list item cap with
(reportedly) silent oldest-first auto-archive, board layout configurable only by hand, and a
response schema Slack has already announced it will change (`key`/`value` deprecation). It
works as a pushed board *view* over an external system of record; it is a poor choice as the
system of record itself.
