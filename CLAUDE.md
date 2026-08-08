# zudo-slack-wisdom

Documentation site built with [zudo-doc](https://github.com/zudolab/zudo-doc) — a zfb-based documentation framework with MDX, Tailwind CSS v4, and Preact islands. This project is intentionally minimal: one config file (`zfb.config.ts`) plus markdown content — layout, chrome, and islands all ship from `@takazudo/zudo-doc` in `node_modules`.

## Tech Stack

- **zfb** — documentation build framework
- **MDX** — content format, authored under `src/content/`
- **Tailwind CSS v4** — compiled by zfb's embedded Tailwind engine (no `@tailwindcss/vite` plugin, no `tailwindcss` dependency); `src/styles/global.css` imports `tailwindcss/preflight` + `tailwindcss/utilities` and zfb's internal resolver serves both
- **Preact** — for interactive islands only (with compat mode for React API)
- **zfb semantic highlighting** — native build-time fenced-code rendering plus lazy `@takazudo/zfb-md-wasm` for HtmlPreview; both emit `hi-*` classes resolved through `--zd-syntax-*` design tokens
- **@takazudo/zudo-doc** — the package that owns everything: layout, chrome, islands, default `@theme` design tokens, and (via `packageOwnedRoutes`, on by default) the doc routes themselves

## Commands

- `pnpm dev` — runs the zfb dev server (port 4321) and the doc-history API server (port 4322) concurrently via `run-p` (`pnpm dev:zfb` / `pnpm dev:history` individually)
- `pnpm dev:network` — same, but zfb binds `--host 0.0.0.0` for LAN access (`pnpm dev:zfb:network` individually); the doc-history server stays loopback-only and LAN clients reach it through zfb's `/doc-history/*` dev proxy
- **Trusted networks only:** this also serves your git doc-history — including UNPUBLISHED local commits — to anyone on the LAN via the `/doc-history/*` proxy
- `run-p` swallows trailing args, so other zfb flags don't forward through `pnpm dev` — pass them directly instead: `pnpm run dev:zfb -- <flags>`
- `pnpm build` — static HTML export to `dist/`
- `pnpm check` — TypeScript type checking
- `pnpm preview` — serve the built `dist/`
- `pnpm b4push` — full local quality gate before pushing (see `scripts/run-b4push.sh`): mdx format check, template drift check, pin parity check, wrangler pin check, `pnpm check`, `pnpm build`, HTML validation, link check
- `pnpm format:md` / `pnpm format:md:check` — format (or check formatting of) `.md`/`.mdx` files under `src/content/`
- `pnpm check:pin-parity` — verify the `@takazudo/zfb*` package group stays on one exact version (`scripts/check-pin-parity.mjs`)
- `pnpm check:wrangler-pin` — verify the installed `wrangler` matches the version the installed `@takazudo/zfb` binary expects (`scripts/check-wrangler-pin.mjs`)
- `pnpm check:template-drift` — diff host files (`pages/`, `src/styles/global.css`, the `claudeSkills` files) against the matching `create-zudo-doc` release, fetched on demand and cached under `node_modules/.cache/` (`scripts/check-template-drift.sh`); genuine intentional divergences go in `.template-drift-allowlist`
- `pnpm check:html` — validate built HTML (`.htmlvalidate.json` rules) via `pnpm dlx html-validate`
- `pnpm check:links` — broken-link check on built `dist/` + absolute-link check on MDX source (`scripts/check-links.js`); known exceptions go in `.check-links-allowlist`
- `pnpm setup:doc-skill` — generate the `slack-wisdom` skill (see "Doc Skill" below) + symlink it into the user-scope skills directory

## Key Directories

```
zfb.config.ts             # THE one config file — zudoDoc({ ...only fields you chose })
pages/
├── index.tsx             # 1-line re-export of the package home route
└── docs/[[...slug]].tsx  # self-contained doc-route stub (required for `pnpm dev`)
  [locale]/docs/[[...slug]].tsx  # same, for non-default locales
src/
├── chrome-bindings.tsx   # optional typed primary chrome / named header / MDX bindings
├── content/
│   └── docs/             # MDX content (this project's showcase docs)
│   └── docs-ja/         # Japanese MDX content (mirrors docs/)
└── styles/
    └── global.css        # @import chain + a token-override slot — that's it
```

Everything else — layout, header, sidebar, footer, doc chrome, islands, and the default design tokens — lives in `node_modules/@takazudo/zudo-doc`. For supported markup replacement, create `src/chrome-bindings.tsx` with `defineChromeBindings`, set `chromeBindingsModule`, and use the primary `Header` / `Footer` / `Sidebar` / `Toc` / `Breadcrumb` / `DocPager` slots or the named `headerRightComponents` registry. The generated default, locale, and doc-history route shapes already consume the same binding object; do not fork a route stub for presentational customization. `npx zudo-doc eject <component>` only copies source: heed its primary, nested-chrome, or content-layer remediation before expecting the copy to render. Settings you didn't set explicitly in `zfb.config.ts` use the package's documented defaults — hover `zudoDoc`'s `ZudoDocConfig` argument in your editor to see every field and its `@default`.

## Content Conventions

### Frontmatter

Schema is the zudo-doc package default (`buildDocsSchema`, shipped by `@takazudo/zudo-doc`, validated by `zfb check`; override via `buildDocsSchema` in `zfb.config.ts` if ever needed). Unknown keys are passed through, not rejected.

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Page title, rendered as the page h1 |
| `description` | string | No | Subtitle / meta description |
| `category` | string | No | Category override (defaults to the containing directory) |
| `sidebar_position` | number | No | Sort order within category (lower = higher). **Always set this** for predictable ordering |
| `sidebar_label` | string | No | Custom text for sidebar display (overrides `title`) |
| `tags` | string[] | No | Cross-category grouping tags |
| `search_exclude` | boolean | No | Exclude from search results |
| `pagination_next` / `pagination_prev` | string \| null | No | Override next/prev page link (`null` to hide) |
| `draft` | boolean | No | Exclude from build entirely |
| `unlisted` | boolean | No | Built but noindexed, hidden from sidebar/nav |
| `hide_sidebar` | boolean | No | Hide the left sidebar, center content |
| `hide_toc` | boolean | No | Hide the right-side table of contents |
| `wide` | boolean | No | Widen the content column |
| `doc_history` | boolean | No | Per-page override for the docHistory feature |
| `standalone` | boolean | No | Hidden from sidebar nav but still indexed |
| `slug` | string | No | Custom URL slug override |
| `generated` | boolean | No | Build-time generated content (skips the bilingual-translation requirement below) |
| `category_no_page` | boolean | No | Category has no landing page (just groups items) |
| `category_sort_order` | `"asc"` \| `"desc"` | No | Sort order for pages within the category |

### File Names & Links

- **Kebab-case file names**: `my-article.mdx`, not `myArticle.mdx` or `my_article.mdx`.
- **Relative links between docs**: use the `.mdx` extension so the remark plugin can resolve and validate them at build time:

  ```markdown
  [Link text](./sibling-page.mdx)
  [Link text](../other-category/page.mdx)
  [Link text](../other-category/page.mdx#anchor)
  ```

  Absolute hrefs that bypass the base path, and links to files that don't exist, are both caught by `pnpm check:links`.

### Mermaid Diagrams

Mermaid is enabled (bundled by `@takazudo/zudo-doc`, no extra dependency needed). Use fenced code blocks:

````markdown
```mermaid

graph TB
  A --> B

```
````

### Admonitions

Available in all MDX files without imports, via directive syntax: `:::note`, `:::tip`, `:::info`, `:::warning`, `:::danger`, `:::caution`, `:::details`. Each accepts an optional **bracketed** title: `:::note[Custom Title]`.

Docusaurus-style `{title="..."}` is **NOT supported**. MDX parses the braces as a JS expression, so it either fails the build with `ReferenceError: title is not defined` or is silently ignored. Always use the bracketed form.

### Headings

Do NOT use h1 (`#`) in doc content — the page title from frontmatter is rendered as h1. Start content headings from h2 (`##`).

### Built-in MDX components

`@takazudo/zudo-doc` ships a few **globally-available MDX components** — usable in any `.mdx` file with **no import**. The seeded `getting-started/index.mdx` already uses one:

- `<CategoryNav category="..." />` — a card-grid list of the pages in a docs category (this is the one seeded into `getting-started/index.mdx`).
- `<CategoryTreeNav category="..." />` — the same listing as a compact nested tree, better for deeper hierarchies.
- `<SiteTreeNavDemo />` — a full-site documentation tree (the MDX-available wrapper of the `SiteTreeNav` island).

Admonitions (above), tabbed content (`<Tabs>` / `<TabItem>`, `<CodeGroup>`), and block math (`<MathBlock>`) work the same way — no import. Full reference: https://zudo-doc.takazudomodular.com/docs/components/

## i18n & Bilingual Rule

- English (default): `/docs/...` — content in `src/content/docs/`
- Japanese: `/ja/docs/...` — content in `src/content/docs-ja/`
- Japanese docs mirror the English directory structure (same relative path under `docs-ja/`)
- Both `pages/docs/[[...slug]].tsx` and `pages/[locale]/docs/[[...slug]].tsx` are self-contained doc-route stubs shipped by the generator — required so `pnpm dev` doesn't 404 on doc pages (a zfb dev-mode limitation on package-injected dynamic routes). Don't delete them.

**Bilingual rule**: every content PR that adds or changes a doc page carries **both** the English (`docs/`) and Japanese (`docs-ja/`) versions of that page. Code blocks, Mermaid diagrams, and any other non-prose content must be **byte-identical** between the two languages — only the surrounding prose is translated. If a Japanese version doesn't exist yet, create it in the same PR.

**Exception**: pages with `generated: true` in frontmatter (the `claude/`, `claude-md/`, `claude-skills/` auto-generated categories — see "Doc Skill" below and `claudeResources` in "Enabled Features") do not require a Japanese translation; they're regenerated on every build and are EN-only by design.

## Content Categories

Top-level directories under `src/content/docs/`, mapped to header nav entries via `categoryMatch` in the `headerNav` list in `zfb.config.ts`. Every category has an `index.mdx`:

- `getting-started/` — Overview, what this site covers
- `worker-backend/` — Cloudflare Worker backend patterns (bot tokens / signing secrets stay server-side)
- `flue/` — Flue 2.x conversation-scoped Slack agent execution, source/version baseline, and application architecture boundaries
- `messaging/` — Slack messaging APIs
- `events/` — Slack Events API
- `lists/` — Slack Lists API (the deep, research-backed section per the epic)
- `data-surfaces/` — Data surface patterns

Auto-generated directories (no header nav entry, managed by the `claudeResources` build integration — see "Doc Skill" below):

- `claude/`, `claude-md/`, `claude-skills/` — regenerated on every `pnpm build`; do not hand-edit

## Content Creation Workflow

### Adding a New Article

1. Create the English `.mdx` file in the appropriate category under `src/content/docs/`
2. Add frontmatter with at least `title` and `sidebar_position`
3. Write content starting with `## h2` headings (not `# h1`)
4. Create the matching Japanese file under `src/content/docs-ja/` at the same relative path
5. Keep code blocks and Mermaid diagrams identical between languages — only translate prose
6. Run `pnpm format:md` to format the MDX files
7. Run `pnpm b4push` (or at least `pnpm build` + `pnpm check:links`) to verify the site builds and links resolve

### Adding a New Category

1. Create the directory under `src/content/docs/` (kebab-case) and the mirrored directory under `src/content/docs-ja/`
2. Create `index.mdx` in both with `title`, `description`, and `sidebar_position`
3. Add a `headerNav` entry in `zfb.config.ts` with `categoryMatch` pointing at the directory name
4. Run `pnpm b4push` to verify

## Doc Skill

`pnpm setup:doc-skill` (`scripts/setup-doc-skill.sh`) generates the `slack-wisdom` skill from this site's built docs and symlinks it into the user-scope skills directory (`~/.claude/skills/` and/or `~/.codex/skills/`). The skill name is overridden to `slack-wisdom` via the `SKILL_NAME` env var in the `setup:doc-skill*` package.json scripts (the script would otherwise derive `zudo-slack-wisdom` from the package name). The generated `.claude/skills/slack-wisdom/` / `.codex/skills/slack-wisdom/` directories are gitignored — do not track or hand-edit them; re-run `pnpm setup:doc-skill` to refresh. The `src/content/docs/claude*/` pages consumed by that skill are written by the `claudeResources` build integration on every `pnpm build`; edit the site's `.claude/` sources (`CLAUDE.md`, skills, commands, agents), not those generated pages, to change their content.

## Enabled Features

- **search** — Full-text search via Pagefind
- **i18n** — English + Japanese bilingual content (see above)
- **claudeResources** — Auto-generated docs for Claude Code resources (`.claude/` → `src/content/docs/claude*`)
- **claudeSkills** — Seeds the `.claude/skills/zudo-doc-*` helper skills (version-bump, design-system, translate)
- **skillSymlinker** — Powers `pnpm setup:doc-skill` (see "Doc Skill" above)
- **sidebarResizer** — Draggable sidebar width
- **sidebarToggle** — Show/hide desktop sidebar
- **tocToggle** — Show/hide the table of contents
- **imageEnlarge** — Click-to-enlarge images
- **dynamicPageTransition** — Animated page transitions
- **docHistory** — Document edit history
- **llmsTxt** — Generates llms.txt for LLM consumption
- **cjkFriendly** — CJK-aware typography (line breaking, spacing) for the Japanese content

## Hosting & CI/CD

- **Hosting**: Cloudflare Workers static assets (adapter: `@takazudo/zfb-adapter-cloudflare`), served at `https://zudo-slack-wisdom.takazudomodular.com`
- **Deploy config, PR preview checks, and the production deploy workflow** are set up by a separate sub-issue (deploy config: `wrangler.toml`, `main-deploy.yml`, `pr-checks.yml`) — not part of this quality-gates task
- **Secrets** (GitHub Actions): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `IFTTT_PROD_NOTIFY` (optional — production-deploy notification)
