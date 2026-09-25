# ZUDO_DEPS_PINS

Provenance for artifacts vendored or generated from first-party (takazudo/zudolab) upstreams.
Updated by /dev-bump-zudo-deps on every sync — keep `pinned:` accurate.

## create-zudo-doc scaffold

- repo: zudolab/zudo-doc
- what: generated doc-site scaffold with claudeSkills, selectively customized and drift-gated
- files: .claude/skills/zudo-doc-design-system/SKILL.md, .claude/skills/zudo-doc-translate/SKILL.md, .claude/skills/zudo-doc-version-bump/SKILL.md, pages/docs/[[...slug]].tsx, pages/index.tsx, pages/[locale]/docs/[[...slug]].tsx, public/favicon-16x16.png, public/favicon-32x32.png, public/favicon.ico, public/favicon.svg, scripts/check-links.js, scripts/setup-doc-skill.sh, src/styles/global.css, tsconfig.json
- source: packages/create-zudo-doc/templates/base/ -> repo root; packages/create-zudo-doc/templates/features/i18n/files/ -> repo root; packages/create-zudo-doc/templates/features/claudeSkills/files/ -> repo root
- track: releases
- pinned: 50cbd5c6c9e5a795d72a74a855e105e4939d4eab (v5.27.0)
- updated: 2026-09-25
- notes: The two doc route stubs are patched for doc history; preserve those intentional divergences in .template-drift-allowlist and the package scripts' explicit `SKILL_NAME=slack-wisdom` override, while non-allowlisted scaffold files must match upstream exactly.
