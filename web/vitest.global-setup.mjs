// Vitest globalSetup — regenerates web/src/buildInfo.ts + worker/src/buildInfo.ts
// before any test file is loaded. These files are gitignored because they
// change on every deploy, but vitest import resolution still needs them to
// exist. This closes the gap where a fresh clone (or CI invoked via
// `npx vitest run` bypassing package-manager scripts) would import-fail.
//
// Kept deliberately simple: shell out to the same generator script used by
// prebuild / predeploy / wrangler.build.command so there's one source of
// truth for what a "build" stamp looks like.

import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

export default function setup() {
  try {
    execSync('node scripts/write-build-info.mjs', { cwd: repoRoot, stdio: 'pipe' })
  } catch (err) {
    // Non-fatal: if the generator fails (no git, no package.json), tests
    // should still be able to run against whatever stale buildInfo.ts
    // happens to be on disk. Log and continue.
    console.warn('[vitest globalSetup] write-build-info.mjs failed:', err.message)
  }
}
