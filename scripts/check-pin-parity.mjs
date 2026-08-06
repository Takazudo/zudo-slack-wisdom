#!/usr/bin/env node
// scripts/check-pin-parity.mjs
//
// Pin-parity gate for this consuming-site repo.
//
// Verifies that related packages stay in lockstep within package.json.
// One version group must be internally consistent:
//
//   zfb group (exact pins) — all four must be the same version:
//     dependencies["@takazudo/zfb"]
//     dependencies["@takazudo/zfb-runtime"]
//     dependencies["@takazudo/zfb-md-wasm"]
//     dependencies["@takazudo/zfb-adapter-cloudflare"]
//
// Historically, bumping one package (e.g. `pnpm up @takazudo/zfb@latest`)
// could silently leave related packages stale. This script makes that drift
// a CI/b4push error.
//
// v5 note: the zfb-md-wasm platform-agnostic package is a 4th member of the
// zfb group here — it didn't exist as a separate dependency in the v4-era
// toolchain this script was ported from.
//
// v5 note: unlike the v4-era sibling this was ported from, `create-zudo-doc`
// is NOT retained as a devDependency after scaffold (it's a one-shot `pnpm
// create zudo-doc` CLI run, not an installed toolchain piece), so there is no
// second "zudo-doc group" to check here — `@takazudo/zudo-doc` and
// `@takazudo/zudo-doc-history-server` are independently versioned deps with
// no cross-package lockstep contract to enforce. create-zudo-doc/zudo-doc
// version parity is instead covered by check:template-drift, which resolves
// the create-zudo-doc release to fetch from the zudo-doc dependency pin.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "..");
const ROOT_PKG_PATH = resolve(ROOT_DIR, "package.json");

const ZFB_PACKAGES = [
  "@takazudo/zfb",
  "@takazudo/zfb-runtime",
  "@takazudo/zfb-md-wasm",
  "@takazudo/zfb-adapter-cloudflare",
];

function main() {
  const rootPkg = JSON.parse(readFileSync(ROOT_PKG_PATH, "utf-8"));
  const mismatches = [];

  // ── zfb group: all exact pins must be equal ───────────────────────────────
  const zfbVersions = ZFB_PACKAGES.map((pkg) => ({
    pkg,
    version: rootPkg.dependencies?.[pkg],
  }));

  const firstZfb = zfbVersions.find((e) => e.version !== undefined);
  if (!firstZfb) {
    mismatches.push({
      group: "zfb",
      reason: `None of ${ZFB_PACKAGES.join(", ")} found in dependencies`,
    });
  } else {
    for (const { pkg, version } of zfbVersions) {
      if (version === undefined) {
        mismatches.push({
          group: "zfb",
          pkg,
          reason: `Missing from dependencies`,
          expected: firstZfb.version,
          actual: "(missing)",
        });
      } else if (version !== firstZfb.version) {
        mismatches.push({
          group: "zfb",
          pkg,
          reason: `Version mismatch within zfb group`,
          expected: firstZfb.version,
          actual: version,
        });
      }
    }
  }

  if (mismatches.length === 0) {
    const zfbVer = firstZfb?.version ?? "(unknown)";
    console.log(`OK — pin parity verified:`);
    console.log(`  zfb group (${ZFB_PACKAGES.length} packages) = ${zfbVer}`);
    for (const { pkg, version } of zfbVersions) {
      console.log(`    ${pkg} = ${version}`);
    }
    return 0;
  }

  console.error("");
  console.error("Pin parity check FAILED — package versions out of lockstep.");
  console.error("");
  for (const m of mismatches) {
    if (m.pkg) {
      console.error(`  [${m.group}] [${m.pkg}]  ${m.reason}`);
    } else {
      console.error(`  [${m.group}]  ${m.reason}`);
    }
    if (m.expected !== undefined) {
      console.error(`    expected: ${m.expected}`);
      console.error(`    actual:   ${m.actual}`);
    }
    console.error("");
  }
  console.error("Fix: align the version(s) in package.json, then re-run this check.");
  return 1;
}

process.exit(main());
