# Slack Lists API — unverified facts checklist

Working checklist for an empirical verification spike. Every item below was flagged as
**unverified, inferred, or undocumented** by prior documentation-only research into the
Slack Lists Web API (the 12 `slackLists.*` methods, GA 2025-09-02 —
<https://docs.slack.dev/changelog/2025/09/02/list-api/>). Context: a bot (xoxb token,
`lists:read` + `lists:write`, paid workspace) acting as sole writer of a list that mirrors
an external database — e.g. a Cloudflare Worker cron pushing rows and flipping a
single-select status column between neutral options A/B/C.

Suggested spike scaffold (settles most items in one session):
`slackLists.create` (bot-owned throwaway list with a select column + spare options) →
`items.create` → `items.update` (flip select) → `items.info` (read back) → repeat variants →
`access.set` experiments → delete. Ordered highest-leverage first within each group.

Method docs index: <https://docs.slack.dev/reference/methods/>

---

## 1. Batch update mechanics (`slackLists.items.update`)

- [ ] **One `items.update` call can carry `cells[]` entries for MANY different `row_id`s.**
  `row_id` lives inside each cell, which structurally allows multi-row batching, but every
  documented sample shows one cell for one row and the docs never state it
  (<https://docs.slack.dev/reference/methods/slackLists.items.update/>).
  — Decides whether a 200-row sync is ~5 seconds (a few batched calls) or ~4 minutes
  (one call per row at Tier 3, 50+/min). The single highest-leverage unknown in the design.
  — Test: one POST with `cells: [{row_id: R1, column_id: C, select:["a"]}, {row_id: R2, column_id: C, select:["b"]}]`
  against two known rows; read both back with `items.info`/`items.list`.

- [ ] **The maximum length of `cells[]` per call.**
  Undocumented on the method page; the error `over_cell_fields_limit` proves a cap exists,
  and a third-party mirror of the raw docs JSON (slack-ruby/slack-api-ref) shows
  `minItems: 1, maxItems: 100` — unconfirmed against the live API.
  — Sets the batch size for the sync loop and the retry strategy when a batch is rejected.
  — Test: send 101 cells in one call; expect `over_cell_fields_limit` at the boundary,
  then bisect if the limit differs.

## 2. Select-column write semantics

- [ ] **Writing `select: ["B"]` to a single-select cell REPLACES the existing "A" (not append/merge).**
  No doc page states replace semantics; for single-select it is the only coherent behavior
  and production apps depend on it, but it is inference, not contract. Matters doubly for
  multi-select columns, where append vs replace genuinely diverge.
  — The status-flip design is wrong if a second write errors or merges.
  — Test: two consecutive `items.update` calls on one row (A then B), then `items.info`;
  assert exactly `["B"]`. Repeat on a multi-select-format column.

- [ ] **`select: []` clears a select cell.**
  Undocumented. At least one production codebase deliberately omits empty cells rather than
  rely on it.
  — Decides whether "no status" needs to be modeled as a real option value.
  — Test: write `select: []` to a populated cell; check for error vs cleared cell on read-back.

- [ ] **Writing an unrecognized option value fails with `invalid_option_id` and does NOT mint a new option.**
  The error is documented ("Option ID provided does not match column definition") but the
  runtime behavior was never observed live — documentation-only evidence.
  — Confirms the option set is closed on the write path; a silent-create would corrupt the schema.
  — Test: write `select: ["nonexistent_slug"]`; expect `invalid_option_id`, then confirm via
  `items.info` that the choice set is unchanged.

- [ ] **Sending two values to a single-select-format column is undefined behavior.**
  Docs never say what happens (error? first wins? both stored?).
  — A mapping bug upstream could silently produce garbage instead of failing loudly.
  — Test: `select: ["a","b"]` against a `format: "single_select"` column; record the outcome.

## 3. Bot access, ownership, and permission grants

- [ ] **How a bot gets write access to a list it did not create.**
  `slackLists.access.set` accepts only `user_ids` or `channel_ids` — no `app_ids`/bot
  argument is documented anywhere
  (<https://docs.slack.dev/reference/methods/slackLists.access.set/>). Passing the bot's
  U-prefixed user ID in `user_ids` *should* work but Slack never states it; sharing into a
  channel the bot belongs to is the fallback. One community report
  (<https://github.com/slackapi/deno-slack-sdk/issues/472>) shows `list_not_found` despite a
  channel share (workflow-token context, so not conclusive for xoxb).
  — Determines the whole setup topology: bot-creates-list vs human-creates-and-shares.
  — Test: human-created throwaway list → `access.set` with the bot's user ID in `user_ids`,
  attempt `items.create`; separately share into a bot-member channel and retry.

- [ ] **A list created via `slackLists.create` with an xoxb token is OWNED by the bot user.**
  Docs say "owned by the acting user" and never say "bot user" — the xoxb case is inferred.
  Downstream consequences (who can set the default view, who can promote a human via
  `access.set` `owner`) hang on this.
  — The bot-as-creator path is the only documented-clean access route; if ownership lands
  elsewhere the design's recovery paths break.
  — Test: bot calls `slackLists.create`, then inspect ownership in the list UI / attempt an
  owner-only action (e.g. `access.set` with `access_level: "owner"` promoting a human).

- [ ] **`access.set` with `access_level: "read"` on an entity that already holds `write` DOWNGRADES it (rather than no-op).**
  The method is named "set" which implies replace, but downgrade semantics are never stated.
  `access.delete` has no `access_level`, so re-set is the only demote path.
  — Needed to recover from an accidental "Can edit" share without revoking access entirely.
  — Test: grant a test user `write`, re-call with `read`, have that user attempt an edit.

- [ ] **API `access_level: "read"` maps exactly to the UI's "Can view" tier.**
  Inferred from three-values-to-three-states; no doc states the mapping verbatim.
  — The read-only-dashboard guarantee rests on this equivalence.
  — Test: grant `read` via API, then open the share dialog in the UI and confirm the
  grantee shows as "Can view" and cannot edit cells.

## 4. Row cap and archiving

- [ ] **Whether the cap auto-archives the oldest rows at all.**
  Reported by the research pass, never verified against Slack docs or empirically. If false,
  hitting the cap may simply hard-fail creates with `over_row_maximum` instead of silently
  archiving.
  — Changes the failure mode of an over-cap mirror from silent data hiding to loud create errors.
  — Test: same bulk-fill approach as the item below; observe whether row 1 disappears from
  `items.list` (unarchived) when row 1,001 is created, or the create fails.
- [ ] **Whether archived rows count against the per-list item cap (1,000 on standard paid tiers, 5,000 on the enterprise tier).**
  Undocumented. `items.create` documents `over_row_maximum` — but whether archiving frees
  headroom is unknown; prior research says "treat `over_row_maximum` as the only authority."
  — Decides whether explicit `items.deleteMultiple` is mandatory for a long-lived mirror or
  archiving alone keeps the list writable.
  — Test: hard to reach 1,000 cheaply; instead read `list_limits` (`row_count`,
  `row_count_limit`, `archived_row_count`) from `items.info` before/after archiving a row in
  the UI, and check whether `row_count` drops. (Full confirmation may need a bulk-fill script.)

## 5. Rate limits

- [ ] **`slackLists.items.create`'s real rate tier: docs page says Tier 2 (20+/min), the Java SDK's scraped metadata says Tier 3 (50+/min).**
  Direct conflict between two Slack-official sources
  (<https://docs.slack.dev/reference/methods/slackLists.items.create/> vs
  <https://github.com/slackapi/java-slack-sdk/blob/main/metadata/web-api/rate_limit_tiers.json>).
  — Sizes the initial backfill of an existing dataset into the list; assume the worse until proven.
  — Test: burst ~30 creates in one minute against a throwaway list and observe where 429 +
  `Retry-After` kicks in.

## 6. Board layout, views, and the viewer experience

- [ ] **Which column types the Board layout can group by.**
  Slack documents Board layout ("items are grouped by field") but never enumerates groupable
  field types — single-select is assumed because every example uses it
  (<https://slack.com/intl/en-gb/help/articles/27452748828179-Use-lists-in-Slack>).
  — If select isn't groupable (or user/date columns are needed), the pipeline-column design changes.
  — Test: on the bot-created list, open the UI → filters → Layout → Board → Group by, and
  record which columns are offered. (UI check, not an API call — no API exposes views.)

- [ ] **Board layout / group-by / default view are configurable ONLY by hand in the UI (no API path), and the default view is owner-only.**
  Neither `slackLists.create` nor `slackLists.update` accepts any view/layout argument;
  `items.info`'s documented `views[]` shows only `record`/`table` types. "Undocumented, not
  proven impossible." Owner-only default-view setting means a bot-owned list needs a human
  with owner/edit rights (or bot-promotes-human) to pin the board for everyone.
  — Setup runbook and recovery-after-recreate both depend on it.
  — Test: create list via bot, call `items.info`, inspect `views[]` for any board type;
  then confirm in the UI who can "Set as default view".

- [ ] **A "Can view" holder cannot drag cards between board columns.**
  Inferred (a drag writes the group-by field, and viewers "cannot make changes") — never
  stated as a board-specific rule
  (<https://slack.com/help/articles/15678967614611-Manage-access-permissions-for-canvases-and-lists>).
  — The read-only guarantee for the dashboard is exactly this.
  — Test: as a `read`-granted test user, attempt to drag a card in Board layout.

- [ ] **Viewers can download the list as CSV.**
  Unverified; suggestive only — `slackLists.download.start` requires just `lists:read`.
  — Data-exfiltration surface consideration when the mirrored data is sensitive.
  — Test: as a `read`-granted user, look for the export/download option in the UI, or call
  `download.start` with a user token holding only view access.

- [ ] **The item detail pane renders read-only for viewers.**
  Docs describe the pane as opening "for editing fields and information" and never describe
  a read-only rendering — inferred from the general no-changes rule.
  — Viewers opening items is a core part of the dashboard UX.
  — Test: open an item as the `read`-granted test user; confirm fields are not editable.

- [ ] **"Drag-and-drop" as the board interaction is unconfirmed wording from primary sources.**
  Official help pages say only "you can move items between columns"; the "click and drag"
  phrasing could not be reproduced from any Slack-hosted page (third-party hands-on coverage
  confirms drag). Minor — affects docs/expectations, not the API design.
  — Test: drag a card as an editor; done in passing during any UI check above.

## 7. Notifications and event side-channels

- [ ] **Whether API-originated writes trigger "notify when field changes" list automations.**
  Undocumented. A cron that rewrites cells every tick could firehose the channel if
  API writes fire the same notifications as human edits.
  — Determines whether field-change notifications can ever be enabled on the mirrored list.
  — Test: enable a field-change notification on the throwaway list, run one `items.update`
  from the bot, watch whether a notification arrives.

- [ ] **Whether Workflow Builder's "When a list item is updated" trigger also fires on item CREATE.**
  Undocumented, and there is no separate "created" trigger. Only matters if the
  workflow-posts-a-message push path is ever used to escape polling.
  — Test: attach the trigger to a throwaway list, `items.create` a row via API, observe.

## 8. Schema-mutation cracks (post-creation)

- [ ] **`column_id_to_create` inside a `cells[]` entry can add a NEW column via `items.update`.**
  Named only in the error string `column_id_not_provided` ("The `column_id` or
  `column_id_to_create` field must be provided"); no argument table, no sample, absent from
  all three official SDKs, zero real-world usage found — possibly a leaked validator string.
  — If real, it softens the "schema is frozen after create" constraint (adding a mirrored
  field later without rebuilding the list).
  — Test: one `items.update` with a cell carrying `column_id_to_create` + a plausible column
  payload; expect either a new column or a clarifying error.

- [ ] **`row_id_to_create` (create-a-row-via-update) actually works, and what the correct payload is.**
  The docs' own sample is self-contradictory (passes both `row_id_to_create: true` AND a
  `row_id` in the same cell); the field is absent from SDK types. Prior research says ignore
  it and use `items.create` — verifying it is cheap insurance against ever needing it.
  — Test: one `items.update` with `row_id_to_create: true` and no `row_id`; read back the list.

- [ ] **`slackLists.update` with `todo_mode: true` adds the three task-tracking columns to an EXISTING list.**
  Documented in prose but attributed to "clients" acting on the flag — whether the API call
  alone mutates the schema server-side is unobserved.
  — The one documented-ish post-creation column addition; also confirms `todo_mode: false`
  at create time is safe to rely on.
  — Test: `slackLists.update` with `todo_mode: true` on the throwaway list, then `items.info`
  and diff `list_metadata.schema[]`.
