# ZUDO_DEPS_PINS

Provenance for artifacts vendored or generated from first-party (takazudo/zudolab) upstreams.
Updated by /dev-bump-zudo-deps on every sync — keep `pinned:` accurate.

## create-zudo-doc scaffold

- repo: zudolab/zudo-doc
- what: generated doc-site scaffold with claudeSkills, selectively customized and drift-gated
- files: .claude/skills/zudo-doc-design-system/SKILL.md, .claude/skills/zudo-doc-translate/SKILL.md, .claude/skills/zudo-doc-version-bump/SKILL.md, pages/docs/[[...slug]].tsx, pages/index.tsx, pages/[locale]/docs/[[...slug]].tsx, public/favicon-16x16.png, public/favicon-32x32.png, public/favicon.ico, public/favicon.svg, scripts/check-links.js, scripts/setup-doc-skill.sh, src/styles/global.css, tsconfig.json
- source: packages/create-zudo-doc/templates/base/ -> repo root; packages/create-zudo-doc/templates/features/i18n/files/ -> repo root; packages/create-zudo-doc/templates/features/claudeSkills/files/ -> repo root
- track: releases
- pinned: 70c574747e498c47f35fa9051ab36b0a69ac808d (v10.0.0; published create-zudo-doc@10.0.0)
- updated: 2026-11-10
- notes: Reconciled host files against published create-zudo-doc@10.0.0. `scripts/setup-doc-skill.sh` was recopied from that release (worktree-safe docs root and locale links). CSS, tsconfig, check-links.js, favicons, home route, and the three claudeSkills files match 10.0.0 bytes. Both doc routes keep the generator's DocHistoryBoundary patch, the only allowlisted drift. `themePack` is omitted so a light/dark site resolves to Graphite; do not restore Observatory or set `"default"` next to `"graphite"`. Preserve dynamicPageTransition, Noto Sans JP head links, the Workers adapter, and `SKILL_NAME=slack-wisdom`. Wrangler stays exact `4.85.0` because the zfb 6.0.1 binary gate requires it. This repo has no MCP scaffold, so it does not take the generated wrangler `4.160.0` or `@cloudflare/workers-types` `5.20261110.1` pins, and `designTokenPanel` is off so `@takazudo/zdtp` `0.9.3` is not a direct dependency. Verified on Node 24 with pnpm 10.25.0: pin parity, template drift, wrangler pin, typecheck, build (112 pages, `data-theme-pack=graphite`), HTML validation, link check, category metadata, and MDX format.
