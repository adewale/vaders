#!/usr/bin/env node
// scripts/verify-deploy-coherence.mjs
//
// Assert the deployed web bundle and the Worker report the SAME commit hash.
//
// Why this exists: `wrangler deploy`'s `build.command` regenerates
// `worker/src/buildInfo.ts` but does not re-run `vite build`. If someone
// runs `vite build` on a dirty tree, then `git commit`, then `wrangler
// deploy` without rebuilding, the Worker's `/health` shows the clean
// commit hash but the already-built JS bundle still carries the dirty
// one. The launch-screen footer then disagrees with `/health`, silently.
//
// This script hits the live endpoint, fetches the HTML-referenced JS
// bundle, extracts the commitHash baked into it, and compares against
// `/health`'s commitHash. Exit non-zero on mismatch.
//
// Usage:
//   node scripts/verify-deploy-coherence.mjs [URL]
//
// Default URL: https://vaders.adewale-883.workers.dev

const URL_ARG = process.argv[2] ?? 'https://vaders.adewale-883.workers.dev'

async function fetchText(path) {
  const res = await fetch(`${URL_ARG}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.text()
}

async function fetchJson(path) {
  const res = await fetch(`${URL_ARG}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

try {
  const health = await fetchJson('/health')
  const workerHash = health.commitHash
  if (!workerHash) throw new Error('/health returned no commitHash')

  const html = await fetchText('/')
  const bundleMatch = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)
  if (!bundleMatch) throw new Error('no bundle reference in index.html')
  const bundlePath = bundleMatch[0]
  const bundle = await fetchText(`/${bundlePath}`)
  const hashMatch = bundle.match(/commitHash\s*:\s*["']([^"']+)["']/)
  if (!hashMatch) throw new Error('no commitHash literal baked into bundle')
  const webHash = hashMatch[1]

  console.log(`worker /health   commitHash=${workerHash}  buildTime=${health.buildTime}`)
  console.log(`web bundle (${bundleMatch[1]})  commitHash=${webHash}`)

  if (workerHash !== webHash) {
    console.error('\nFAIL: deployed surfaces disagree on commitHash.')
    console.error('This happens when `vite build` was run on a dirty tree,')
    console.error('then committed, then `wrangler deploy` was invoked without')
    console.error('rebuilding the web bundle. Re-run `cd web && npx vite build`')
    console.error('and then `wrangler deploy` to align them.')
    process.exit(1)
  }

  // Also flag a "-dirty" deploy — the script accepts it (sometimes you
  // deploy from a known-WIP state intentionally) but log it visibly so
  // it's not missed.
  if (workerHash.endsWith('-dirty')) {
    console.warn('\nWARN: deployed from a dirty working tree. Clean the tree')
    console.warn('and redeploy before tagging this as a release.')
  }

  console.log('\nOK: deployed surfaces are coherent.')
  process.exit(0)
} catch (err) {
  console.error('ERROR:', err.message)
  process.exit(1)
}
