# `slackLists.items.update` — the exact contract for writing List cells

Research digest on updating cells (especially select/status columns) in a Slack List from a bot,
e.g. a Cloudflare Worker cron mirroring an external database into a Slack List. All claims were
verified against three lenses (primary docs, official SDK types, adversarial skeptic); confidence
notes are inline.

Primary reference: [slackLists.items.update](https://docs.slack.dev/reference/methods/slackLists.items.update/)

---

## The request shape: `list_id` + `cells[]`, with `row_id` INSIDE each cell

`slackLists.items.update` takes exactly three arguments — `token` (header), `list_id`, `cells` —
all required, none optional. There is **no top-level `row_id`**: each entry in `cells[]` carries
its own `row_id` alongside `column_id` and one typed value key.

Slack's own docs carry a sample literally titled "Update select option":

```json
{
  "list_id": "F01ABCDE2FG",
  "cells": [
    { "column_id": "Col018AL7649G", "select": ["in_progress"], "row_id": "Rec018B8RR603" }
  ]
}
```

Cross-referencing [slackLists.items.info](https://docs.slack.dev/reference/methods/slackLists.items.info/)
proves `Col018AL7649G` in that sample is a `type: "select"` / `format: "single_select"` "Status"
column — so the docs demonstrate the exact single-select flip, not a stretched analogue.

Because each cell has its own `row_id`, one call can batch updates across many rows and columns:

```json
{
  "list_id": "F01ABCDE2FG",
  "cells": [
    { "row_id": "Rec0AAA111", "column_id": "Col0STATUS01", "select": ["done"] },
    { "row_id": "Rec0BBB222", "column_id": "Col0STATUS01", "select": ["doing"] },
    { "row_id": "Rec0BBB222", "column_id": "Col0OWNER99",  "user": ["U01284PCR98"] }
  ]
}
```

Other contract facts:

- **Scope:** bot token with `lists:write` only. `lists:read` is NOT required for the write
  ([lists:write scope](https://docs.slack.dev/reference/scopes/lists.write/)).
- **Response:** a bare `{"ok": true}`. No echo of the updated row, no revision token —
  confirmation requires a follow-up read.
- **Content type:** use `application/json`. Form-encoding is nominally accepted, but `cells` is
  an array of objects containing arrays; a bad form-encode returns `invalid_array_arg`.
- **Plan gate:** Lists are paid-plan only; free workspaces get `paid_teams_only`.
- **`cells[]` cap:** the raw docs JSON (mirrored in
  [slack-ruby/slack-api-ref](https://github.com/slack-ruby/slack-api-ref)) constrains `cells` to
  `minItems: 1, maxItems: 100`; `over_cell_fields_limit` is the corresponding error. Keep batches
  modest.
- **No formal `cells[]` sub-schema exists in the docs.** Every cell property (`row_id`,
  `column_id`, typed value keys, `row_id_to_create`, `column_id_to_create`) appears only in
  samples or error strings — the arguments table just says "Cells to update".

## Typed value keys — nearly everything is array-wrapped, even scalars

Each cell carries exactly one typed value key matching the column type. Nearly every one is an
**array even when it holds a single value**:

| Column type | Cell key and shape |
|---|---|
| select (single or multi) | `select: ["opt_value"]` — always a string array |
| user | `user: ["U01..."]` |
| checkbox | `checkbox: [true]` |
| rating | `rating: [3]` |
| number | `number: [42]` |
| date | `date: ["2026-08-06"]` |
| timestamp | `timestamp: [1699999999]` |
| text / notes | `rich_text` with Block Kit rich_text structures — NOT a plain string (`invalid_blocks` / `invalid_text_block` on failure) |

Sending a bare scalar (`select: "done"`) fails with `invalid_input_type`. Only the read-side
`text` convenience field is a bare string.

**Single vs multi select are written identically.** There is no `multi_select` cell key in the
docs or in any SDK type union — both column formats go through `select: [...]`; the column's
`options.format` decides how many entries are accepted. Sending two values to a `single_select`
column is undefined behavior in the docs — don't.

## Select values are the option `value` slugs, NEVER the labels

The `select` array carries the column schema's `options.choices[].value` — the machine slug —
never `choices[].label` (the chip text a human sees). Writing a label returns
`invalid_option_id`.

The docs' prose calls select values "an array of List encoded option IDs" and uses
`OptHIGH123`-style placeholders, but **no choice object anywhere in the API has an `id` key** —
choices are exactly `{value, label, color}` in every surface checked: the
[slackLists.create](https://docs.slack.dev/reference/methods/slackLists.create/) request and
response, the `items.info` schema, the
[node SDK's `SlackListsSchemaColumnChoice`](https://github.com/slackapi/node-slack-sdk/blob/main/packages/web-api/src/types/request/slackLists.ts),
and the Java SDK's `ListColumnOptions.Choice`. **The `value` IS the option ID.** The docs' own
worked example proves it: column `Col018AL7649G` has
`{"value": "in_progress", "label": "In Progress"}` and the update sample writes
`["in_progress"]`.

Whether the slug is opaque depends on who created the list:

| List created by | Option value looks like | Consequence |
|---|---|---|
| Your bot via `slackLists.create` | whatever slug you chose (`"doing"`) | No lookup ever needed; values are compile-time constants |
| A human in the Slack UI | opaque, e.g. `OptXXXXXXXX` | Read them back once via `items.info` and store the map |

Production evidence that this is the working pattern for non-English labels:
[navikt/saape-slackapp](https://github.com/navikt/saape-slackapp) declares Norwegian chips as
`{value: 'pending', label: 'Avventer'}, {value: 'in_progress', label: 'Pågår'}, ...` and flips
them with `select: [listStatus]`. The
[n8n community node's README](https://github.com/hoyo/n8n-nodes-slack-lists) states "Select
columns accept and return the option *value* (e.g. `day_1`, `OptXXXXXX`)". And
[SirMaiquis/deno-mr-poc](https://github.com/SirMaiquis/deno-mr-poc) ships a label→value resolver
(`choices.find(c => c.label === ...)` → send `option.value`) — code that would not exist if
labels worked.

Degenerate edge: if a column was defined with `value === label`, sending the label text works —
because it is the value.

## The bot-creates-the-list pattern

**Have the bot create the list itself via `slackLists.create`.** This kills two problems at once:

1. **You choose the slugs.** Neutral ASCII values (`todo` / `doing` / `done`) under any display
   label, so the label↔ID mapping problem disappears entirely.
2. **Access.** How a bot gets write access to a list it did NOT create is genuinely undocumented:
   [slackLists.access.set](https://docs.slack.dev/reference/methods/slackLists.access.set/)
   accepts only `channel_ids` and `user_ids` — there is no `app_ids`/bot argument anywhere. Yet
   `items.update` clearly enforces access (`access_denied`, `no_permission`,
   `permission_denied`). The creator implicitly has access, making bot-creates-list the only
   documented-clean path. There is a real community report
   ([slackapi/deno-slack-sdk#472](https://github.com/slackapi/deno-slack-sdk/issues/472)) of
   `list_not_found` from `items.update` despite the list being shared into the bot's channel
   (pre-GA, workflow token). Do not plan around a human creating the list and "sharing it with
   the bot" until you've proven that path with a throwaway call.

If a human already made the list: there is **no `slackLists.info` and no `slackLists.list`**.
Discovery is `slackLists.items.info` (needs `lists:read`), which returns the whole list object
including `list.list_metadata.schema[]` — each select column with its `id` and its
`options.choices[]`. Call it once by hand, then hardcode.

**What to persist** (all stable, none discoverable at runtime without an extra call):

- `list_id` (`F…`) and `column_id` per written column (`Col…`)
- the `value` slug per select option
- `row_id` per mirrored item (`Rec…`), returned by `slackLists.items.create` — store it on the
  corresponding row in your own datastore. This is the one you must not lose: **there is no
  "find row by external key" API.**

## Schema mutability — subtler than "immutable"

The blanket claim "the schema is fixed at creation and cannot be altered via API" was **refuted
3/3** by verification — but the operationally load-bearing part survives. The precise reality:

- **You cannot mint a select option by writing an unknown value.** Confirmed: writes are
  validated against the column definition (`invalid_option_id` — items.create's variant reads
  "Option ID provided does not match column definition"). The cell shape
  `{column_id, select: string[]}` has no structural room to carry a new option's label/color.
- **No documented API edits an existing select column's choices** — no add, rename, recolor,
  reorder, or remove. [slackLists.update](https://docs.slack.dev/reference/methods/slackLists.update/)
  accepts only `id`, `name`, `description_blocks`, `todo_mode`; none of the 12 `slackLists.*`
  methods touches column definitions. Notably there is **no `option_id_to_create`** anywhere in
  the 50-entry error registry, while row and column analogues both exist — strong structural
  evidence the option set is deliberately closed to the API.
- **BUT the schema is not fully immutable via API:** `slackLists.update` with `todo_mode: true`
  causes task-tracking columns to be created on an existing list (Completed/`todo_completed`,
  Assignee/`todo_assignee`, Due date/`todo_due_date`) — the docs' usage prose says so verbatim.
- **`column_id_to_create` is an undocumented crack:** it is named only inside the
  `column_id_not_provided` error string ("The `column_id` or `column_id_to_create` field must be
  provided") — a column-creating alternative the endpoint's validator recognizes. It has no
  argument definition, no sample, no SDK type, and GitHub code search finds zero real-world use
  (only doc mirrors). Treat it as an unproven crack, not a feature.
- **Humans can edit the schema in the Slack UI at any time** — add options, delete options,
  rename labels. A cached value→label map can go stale mid-life: a deleted option starts
  returning `invalid_option_id` on writes that used to work; label renames are safe (you write
  values, not labels). On `invalid_option_id`, re-read `list_metadata.schema` via `items.info`
  rather than trusting hardcoded constants.
- The sanctioned API workaround for "I need one more option" is a NEW list:
  `slackLists.create` with `copy_from_list_id` + `include_copied_list_records` (you cannot pass
  both `copy_from_list_id` and `schema` — `invalid_copy_and_schema_args`). That mints new
  `list_id`/`column_id`s to re-persist.
- **Computed columns are unwritable:** `created_by`, `last_edited_by`, `created_time`,
  `last_edited_time` return `uneditable_column`.
- **Limits** (from `slackLists.create`): 100 options per select column; max 50 selected per
  cell. Allowed chip colors: `indigo, blue, cyan, pink, yellow, green, gray, red, purple,
  orange, brown`.

**Practical consequence: over-provision status options at creation time** (bake in spare slugs).
Adding one later means a human edits the list in the Slack UI or you rebuild the list.

## Error codes worth branching on

| Error | Meaning |
|---|---|
| `invalid_option_id` | Wrong slug — you probably wrote a label, or the option was deleted |
| `invalid_input_type` | Wrong value key, or scalar instead of array |
| `invalid_array_arg` | Array arg mangled — usually form-encoding instead of JSON |
| `invalid_column_id` / `column_not_found` | Stale persisted column ID |
| `invalid_row_id` / `row_not_found` | Stale persisted row ID |
| `column_id_not_provided` | Cell missing `column_id` (or `column_id_to_create`) |
| `uneditable_column` | Computed column (created_by, last_edited_time, …) |
| `over_cell_fields_limit` | Too many cells in one call (docs JSON: max 100) |
| `list_not_found` | Bad `list_id` — also reported for access failures (see #472 above) |
| `no_permission` / `access_denied` / `permission_denied` | Bot lacks list access |
| `paid_teams_only` | Free workspace |
| `lists_disabled_user_team` | Admin has disabled Lists for the workspace (distinct from the plan gate) |
| `over_row_maximum` | Per-list item cap reached (create path; the cap's only authoritative signal) |
| `missing_scope` | Token lacks `lists:write` |
| `invalid_blocks` / `invalid_text_block` | Malformed `rich_text` cell |
| `ratelimited` | Honor `Retry-After` |

## Rate tiers

- `slackLists.items.update`: **Tier 3 (50+/min)** — docs and the Java SDK's machine-readable
  [rate_limit_tiers.json](https://github.com/slackapi/java-slack-sdk/blob/main/metadata/web-api/rate_limit_tiers.json)
  agree. Fine for a cron; if one tick flips hundreds of rows, batch multi-cell calls instead of
  one call per row, and honor `Retry-After` on 429.
- `slackLists.items.create`: docs say Tier 2, the Java SDK metadata says Tier 3. Assume the
  worse if bulk-inserting.

## Where docs and SDKs disagree

- **Column `type` list.** Primary docs enumerate `text, message, number, select, date, user,
  attachment, checkbox, email, phone, channel, rating, created_by, last_edited_by, created_time,
  last_edited_time, vote, canvas, reference, link` — multi-select is expressed as
  `options.format: "multi_select"` on a `select` column. The
  [node SDK types](https://github.com/slackapi/node-slack-sdk/blob/main/packages/web-api/src/types/request/slackLists.ts)
  additionally list `multi_select`, `rich_text`, `assignee`, `due_date`, `todo_*` as column
  types. Trust the docs for what you send to `create`.
- **`row_id_to_create`.** The docs show a create-row-via-update sample that is
  self-contradictory (passes both `row_id_to_create: true` AND `row_id` in the same cell); the
  SDK types omit the field entirely (`row_id` is required). Ignore this path — create rows with
  `slackLists.items.create` + `initial_fields`.
- **SDK types are not independent corroboration.** There is no official OpenAPI spec covering
  Lists — [slackapi/slack-api-specs](https://github.com/slackapi/slack-api-specs) contains zero
  `slackLists` paths. All three official SDKs' Lists types are hand-curated from the prose docs,
  so types agreeing with docs is one source, not two. Conversely, absence from SDK types is not
  absence from the wire API (`column_id_to_create` proves it).
- **A hallucination to not build on:** two web-search summarizers asserted a
  `slackLists.columns.list` method exists. It does not — the method surface is exactly 12,
  confirmed by two independent machine-readable enumerations, and code search for
  `slackLists.columns` returns zero hits.

## Copy-pasteable Worker-side example

```ts
const SLACK_API_BASE_URL = "https://slack.com/api";

// Opaque Slack IDs, persisted by us: list_id + column_id come from
// slackLists.create (or items.info); row_id comes from slackLists.items.create
// when the bot first inserts the row.
const LIST_ID = "F09ABCDE1FG";
const STATUS_COLUMN_ID = "Col07XSTATUS01";

// The bot writes the slug (options.choices[].value); Slack renders the label
// chip. Choose slugs at slackLists.create time — no API path edits an
// existing column's option set afterwards (UI edits and todo_mode column
// additions are the only post-creation schema changes; see schema section).
const STATUS_OPTION = {
  todo: "todo",
  doing: "doing",
  done: "done",
} as const;

export async function setListItemStatus(
  botToken: string,
  rowId: string,
  option: (typeof STATUS_OPTION)[keyof typeof STATUS_OPTION],
): Promise<void> {
  const res = await fetch(`${SLACK_API_BASE_URL}/slackLists.items.update`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${botToken}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      list_id: LIST_ID,
      cells: [
        {
          row_id: rowId,               // <- INSIDE the cell, not top-level
          column_id: STATUS_COLUMN_ID,
          select: [option],            // <- ALWAYS an array, even single-select
        },
      ],
    }),
  });

  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (body.ok !== true) {
    throw new Error(`slackLists.items.update rejected: ${body.error}`);
  }
  // Success body is literally {"ok": true} — no updated row is returned.
}
```

Do not route this through a GET/form-encoded path: form-encoding an array of objects produces
`invalid_array_arg`.

## What remains unverified — test with one throwaway script

Unanimously confirmed (0 refutations across all lenses): the method name, three-arg shape,
`row_id` inside the cell, `select` as a string array of `choices[].value`, `lists:write` bot
scope, Tier 3, `{"ok": true}` response, closed option sets, and the failure modes. Build on
these without hedging. Still unverified:

1. **How a bot gets write access to a list it did not create** — the real hole (see above).
2. **Replace-vs-append on a single_select.** No page states that writing `select: ["B"]` clears
   `"A"`. It is the only coherent semantics for single-select and production apps depend on it,
   but it is inference, not contract.
3. **`select: []` to clear a value.** Undocumented.
   [Kero46/slack-review-reminder](https://github.com/Kero46/slack-review-reminder/blob/main/lib/list_io.ts)
   deliberately omits empty cells rather than rely on it. If you need "no status", make it a
   real option (`"none"`).
4. **The practical `cells[]` batch ceiling** (docs JSON says 100; find yours empirically if
   batching aggressively).

One 5-minute throwaway script settles all of it before you commit the design:
`slackLists.create` → `items.create` → `items.update` (flip) → `items.info` (read back) →
`items.update` (flip again).

## Sources

- https://docs.slack.dev/reference/methods/slackLists.items.update/
- https://docs.slack.dev/reference/methods/slackLists.items.info/
- https://docs.slack.dev/reference/methods/slackLists.items.list/
- https://docs.slack.dev/reference/methods/slackLists.items.create/
- https://docs.slack.dev/reference/methods/slackLists.create/
- https://docs.slack.dev/reference/methods/slackLists.update/
- https://docs.slack.dev/reference/methods/slackLists.access.set/
- https://docs.slack.dev/reference/scopes/lists.write/
- https://github.com/slackapi/node-slack-sdk/blob/main/packages/web-api/src/types/request/slackLists.ts
- https://github.com/slackapi/java-slack-sdk/blob/main/metadata/web-api/rate_limit_tiers.json
- https://github.com/slackapi/slack-api-specs
- https://github.com/slackapi/deno-slack-sdk/issues/472
- https://github.com/slack-ruby/slack-api-ref
- https://github.com/navikt/saape-slackapp
- https://github.com/Kero46/slack-review-reminder/blob/main/lib/list_io.ts
- https://github.com/hoyo/n8n-nodes-slack-lists
- https://github.com/SirMaiquis/deno-mr-poc
