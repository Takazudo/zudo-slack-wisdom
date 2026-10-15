# ZUDO_DEPS_PINS

Provenance for artifacts vendored or generated from first-party (takazudo/zudolab) upstreams.
Updated by /dev-bump-zudo-deps on every sync — keep `pinned:` accurate.

## create-zudo-doc scaffold

- repo: zudolab/zudo-doc
- what: generated doc-site scaffold with claudeSkills, selectively customized and drift-gated
- files: .claude/skills/zudo-doc-design-system/SKILL.md, .claude/skills/zudo-doc-translate/SKILL.md, .claude/skills/zudo-doc-version-bump/SKILL.md, pages/docs/[[...slug]].tsx, pages/index.tsx, pages/[locale]/docs/[[...slug]].tsx, public/favicon-16x16.png, public/favicon-32x32.png, public/favicon.ico, public/favicon.svg, scripts/check-links.js, scripts/setup-doc-skill.sh, src/styles/global.css, tsconfig.json
- source: packages/create-zudo-doc/templates/base/ -> repo root; packages/create-zudo-doc/templates/features/i18n/files/ -> repo root; packages/create-zudo-doc/templates/features/claudeSkills/files/ -> repo root
- track: releases
- pinned: 82049856397927077c5288465db34e44d0939260 (v7.0.0; published create-zudo-doc@7.0.0)
- updated: 2026-10-15
- notes: Three-way reconciled published 5.28.1 and 7.0.0 templates against the host; registry attestation identifies the v7.0.0 source commit above. Both routes retain the standard DocHistoryBoundary feature patch as the only allowlisted differences. CSS, tsconfig and design-system skill match 7.0.0; other scaffold scripts, assets, home route, translation and version-bump skills remained byte-identical. Preserve observatory branding, dynamicPageTransition, Noto Sans JP head links, Workers adapter and explicit SKILL_NAME=slack-wisdom scripts. Local install, frozen install with CI-pinned pnpm 10.25.0, types, drift, pins, category metadata, ten link regressions, MDX formatting and Wind audit passed on Node 24. A full build with CI-pinned pnpm 10.25.0 passed (112 pages); b4push and browser acceptance are coordinated separately before integration.
