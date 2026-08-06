# Slack Lists as a read-only status dashboard (bot writes, humans view)

Research digest: can a Slack List be shared view-only, with a bot as the sole writer, acting as a
one-way status board mirrored from an external database (e.g. a Cloudflare Worker cron syncing rows
into Slack)? Answer: yes — read-only is real, server-enforced, and settable from a bot token — with
five known holes and a set of one-way-mirror mechanics you must own client-side.

All claims below were verified against live Slack primary docs (docs.slack.dev, slack.com/help)
in August 2026, several adversarially (two independent verification passes per critical claim).

## 1. The `slackLists.access.set` contract

Doc: https://docs.slack.dev/reference/methods/slackLists.access.set/

- `access_level` is a **required** argument — no default, no implicit grant. Omitting it fails the
  call. Exactly three documented values:
  - `read` — "grants read access to the List"
  - `write` — "grants read and write access to the List"
  - `owner` — makes the specified user in `user_ids` the owner
- Grantees: `user_ids` or `channel_ids`. They are **mutually exclusive, and at least one is
  required** ("Both channel_ids and user_ids cannot be passed at the same time, but at least one of
  them is required").
- **Illegal combo:** `access_level: "owner"` + `channel_ids` returns `invalid_arguments` — only
  users can be owners.
- Slack ships a canned sample for exactly the dashboard case:
  `{"list_id":"F1234567","access_level":"read","channel_ids":["C7654321"]}` (and a `user_ids`
  variant). Success response is `{"ok": true}`.
- Scope: `lists:write` (bot and user tokens). Rate limit Tier 3 (50+/min). Paid plan (Pro+)
  required — a free workspace gets `paid_teams_only`; `lists_disabled_user_team` is the distinct
  error for the admin toggle that disables Lists workspace-wide (exact error↔cause mapping is
  docs-derived, not empirically confirmed)
  (https://slack.com/help/articles/28932867593875-Manage-list-settings-in-Slack).
- **No read-back:** there is no `access.list`/`access.get`/`slackLists.info`. Grants are
  write-only; you cannot programmatically audit who holds read vs write. The only audit path is the
  UI Share pane.
- `slackLists.access.delete` is a full revoke (no `access_level` argument). To demote write→read,
  re-call `access.set` with `read` — the method is named "set", implying replace, though downgrade
  semantics are never stated outright in the docs.
- SDK caveat: node-slack-sdk types `access_level` as plain `string`, not `'read'|'write'|'owner'` —
  a typo compiles and only fails at runtime.

## 2. "Can view" UI semantics

Doc: https://slack.com/help/articles/15678967614611-Manage-access-permissions-for-canvases-and-lists

- API `read` maps to the UI's **"Can view"** (vs "Can edit", plus a separate Owner role). Note this
  mapping is inferred from three-values-to-three-states; no doc states it verbatim.
- The role table gives "Can view" holders exactly two rights: *share the list with other people*
  and *grant others view access*. Granting **edit** is reserved to owners and edit-holders.
- Consequence: read-only is **closed under escalation** — if no human holds write, no human can
  hand write to anyone. It is *not* closed under propagation (viewers can spread view access)
  unless the owner enables limited sharing (see hole 3 below).

## 3. What viewers can and cannot do

Doc: https://slack.com/help/articles/27452748828179-Use-lists-in-Slack

Viewers **can**:

- Switch Board ↔ Table layout and change filters/sort/group ad hoc — layout is a per-viewer
  preference with no documented access gate ("Whether you've created a list or you're viewing
  someone else's, you can adjust how the information appears").
- Switch between existing saved views ("Anyone with access to a list can quickly switch between
  views").
- Open item detail panes.
- **Read and post comments in item threads.** This is a list-specific carve-out, explicitly
  different from canvases: "people with view access to a list can add comments in list items'
  threads." Read-only protects the data, not the silence.
- Probably download CSV (unverified; `slackLists.download.start` only requires `lists:read`, which
  is suggestive).

Viewers **cannot**:

- **Drag cards between board columns.** Slack defines board layout as "items are grouped by field,
  and you can move items between columns" — the drag is a write to the group-by field, and it is
  the defining board interaction. Viewers get a look-but-don't-touch Kanban.
- Add/edit/delete items or cells; add/delete columns; assign people.
- **Save a view**: "You need edit access to save views in lists that you didn't create." Viewer
  layout/filter changes are ephemeral.
- Set the default view — owner-only, and **only settable in the UI** (no API).

So read-only does *not* degrade the list to a bare table, but "fully usable board" would be an
overstatement — one verification pass refuted that wording explicitly.

## 4. The five read-only holes

None are fatal; all need to be known:

1. **Viewers can comment** in item threads (above). The board is read-only, not silent.
2. **Admins can delete it.** "Owners and admins can delete any canvas or list that they can view."
   No ACL stops a workspace/org admin.
3. **Viewers can re-share view access** onward — unless the owner sets Share → Advanced settings →
   **"Only you can share"** (limited sharing). Turn this on for a dashboard.
4. **Public-channel leak.** Sharing a list set to "Only invited people can access" into a **public**
   channel makes it visible to the entire workspace/Enterprise org — not just that channel. If the
   mirrored data is sensitive (client names, deal titles), share into a **private** channel only.
5. **The UI share dialog defaults to "Can edit".** The API cannot fall into this (the param is
   required with no default), but a human sharing the board by hand will grant the whole channel
   write access unless they change the dropdown. Three separate Slack help walkthroughs confirm the
   "Can edit" default label.

Bonus trap: a **Form workflow** published on a list inserts items regardless of anyone's access
level, with audience "All members (by default)". Publish no form on a mirrored list. Related:
whether "notify when field changes" automations fire on API-originated writes is undocumented — a
cron touching rows every sync could firehose the channel; test before enabling.

## 5. Ownership topologies

`slackLists.create` creates a list "owned by the acting user" — with a bot token (`xoxb`) that is
the bot (inferred from "acting user"; docs never literally say "bot user"). The list starts private
to the bot; sharing is a separate, deliberate `access.set` call.

The catch: the default view (and Board layout / group-by setup) is owner-configured and UI-only —
and a bot cannot click. Two workable topologies, each leaving exactly one human with write:

- **(a) Human creates + configures** the list (Board layout, group-by, default view), then grants
  the bot `write` and the channel `read`.
- **(b) Bot creates, then promotes a human owner**: bot calls `access.set` with
  `access_level: "owner"` + the operator's `user_ids`. This is legal only while the bot is still
  owner — "only the current file owner can set another user as the owner." Do it early: there is
  no documented recovery if the app is uninstalled while the bot is sole owner.

Either way, read-only is a guarantee for the *team*, not literally every human. Record the
operator's name in the runbook. Also: guests only see lists shared into channels they belong to.

## 6. One-way mirror mechanics

The Lists API is a thin CRUD surface: exactly 12 `slackLists.*` methods, no upsert, no
find-or-create, no bulk create, no events. Method docs:
[items.create](https://docs.slack.dev/reference/methods/slackLists.items.create) ·
[items.update](https://docs.slack.dev/reference/methods/slackLists.items.update) ·
[items.info](https://docs.slack.dev/reference/methods/slackLists.items.info) ·
[items.list](https://docs.slack.dev/reference/methods/slackLists.items.list) ·
[items.deleteMultiple](https://docs.slack.dev/reference/methods/slackLists.items.deleteMultiple) ·
[slackLists.update](https://docs.slack.dev/reference/methods/slackLists.update)

Read-only flips the usual objections: "no Events API, polling only" is irrelevant when the bot is
the sole writer, and reconciliation becomes a sanity check rather than a correctness requirement
(writing all mirrored columns every changed row silently overwrites any out-of-band edit).

### Row-id persistence — the caller owns the mapping

- **No upsert, no external_id, no idempotency key** on any method. `items.create`'s complete
  argument set is `token`, `list_id`, plus optional `duplicated_item_id` (a clone instruction, not
  a dedupe key), `parent_item_id`, `initial_fields`. Its 44-entry error table has no
  `duplicate_item`/`already_exists`/`conflict`. Two identical creates = two rows, silently.
- `items.create` returns the new row id as `item.id` (Rec-prefixed, e.g. `Rec018ALA7RPU`).
  **Persist it to your database in the same step as the create, before any other work** — a
  failure between create and persist orphans a Slack row you can never address again, and the next
  run duplicates it.
- Branch create-vs-update on whether your record already carries a Slack row id (an additive,
  nullable column on your source table plus an index is enough).
- Duplicates can occur **within a single run** too: the SDK's default retry policy
  (`tenRetriesInAboutThirtyMinutes`) retries network-level failures, so a create that timed out
  client-side but succeeded server-side is retried into a second row. Set `retryConfig` explicitly
  on create calls.
- `items.update` addresses cells by `row_id` **inside each cell object** (not top-level) — knowing
  the row id is a hard precondition for every write after the first. Its response is a bare
  `{ok: true}`. Watch out: the docs' samples show a `row_id_to_create: true` cell flag giving
  `items.update` a second *create* path (sample-only, absent from the SDK types — medium
  confidence).
- Recovery path if the mapping is ever lost: mirror your own primary key into a text column on
  each Slack row, then rebuild the map from one full paginated `items.list`. There is no filter/
  search/query parameter on `items.list` (only `limit`, `cursor`, `archived`), so existence checks
  always mean paginating the whole list at Tier 2 (20+/min).
- Address cells by `column_id` + typed value keys from day one — the `key` / generic `value` forms
  are deprecation-announced. Text cells take rich-text block structures, not plain strings.

### Freshness stamp via `description_blocks`

One `slackLists.update` call at the end of each successful sync, rewriting `description_blocks` to
something like `Synced from <source> · 2026-08-06 14:32 · 187 rows`. Tier 2, no row cost, no cap
impact. **Note the argument is `id`, not `list_id`** — inconsistent with every `items.*` method.
Do *not* use a per-row "last synced" column: N writes per sync, and it makes every row look
changed. (`slackLists.update` accepts only `id`/`name`/`description_blocks`/`todo_mode` — which
also means the schema is effectively immutable after create; no documented way to add, remove, or
retype a column. Column limit is 30 — be generous up front. Set `todo_mode: false` at create.)

### Reconcile pass — run it twice, once with `archived: true`

Infrequent (hourly/daily) full pass: paginate `items.list`, diff the `row_id` set against your
database, then **run it once more with `archived: true`** — that is the only way to see what
auto-archive removed. Roughly 10 calls per 1,000 items at Tier 2. `items.list` also returns
`updated_by`, so you can flag any row last touched by someone other than the bot.

### Cap policy — never let the list be the system of record

- Hard limit: **1,000 items** (5,000 on Enterprise Grid) with **oldest-auto-archive** — the
  nastiest failure mode: a row your database still points at silently disappears, with no event
  and no error until a later `items.update` fails. Subtasks (`parent_item_id`) count against the
  same budget; avoid them entirely. `items.create` documents an `over_row_maximum` error.
- Mirror only a bounded working set (e.g. non-archived / active records), and hard-cap your own
  mirror well under the limit (300–500).
- Read `list_limits` (`row_count`, `row_count_limit`, `over_row_maximum`, `archived_row_count`)
  from **one `items.info` call against a permanent sentinel row** — `items.list` returns no counts
  at all.
- When over your own ceiling, remove your oldest rows with an explicit `items.deleteMultiple`
  (Tier 2). Explicit deletion beats auto-archive: you pick the victims and keep the row-id map
  clean. Whether archived rows still count toward the cap is undocumented — treat
  `over_row_maximum` as the only authority.

### Open performance question

Because `row_id` lives inside each cell, one `items.update` call could structurally carry cells
for many rows — but the docs only ever show one cell for one row and never state multi-row
support. This is the difference between a ~5-second and a ~4-minute 200-row sync (one call per row
at Tier 3 ≈ 50/min). Test it empirically before finalizing; either way, guard the cron against
overlapping its next tick (a run lock/lease).

## Setup checklist

1. Plan is Pro or above; an admin has not disabled Lists.
2. Add `lists:read` + `lists:write` scopes and reinstall the app.
3. Pick an ownership topology (Section 5); one human holds write either way — name them.
4. Share into a **private** channel with `access_level: "read"`.
5. Enable **"Only you can share"** (Share → Advanced settings).
6. Publish **no Form workflow**; leave field-change notifications off until tested against API
   writes.
7. Accept: admins can delete the board at any time, and viewers can comment in item threads.
