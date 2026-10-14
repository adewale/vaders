/**
 * Self-test for tools/difficulty-report-lib.js — run with:
 *
 *   bun tools/difficulty-report-test.js
 *
 * Tests the pure data transforms against the committed demo dataset
 * (tools/sample-data/ship-v1-vs-v2.results.json, real sim output: ship-v1 +
 * ship-v2, 800 games) plus synthetic edge cases. If a second real dataset is
 * available at /tmp/sim-results/results.json (ship-v1, easier-multi, flat,
 * classic-ramp), the merge tests run against it too; otherwise those merge
 * tests fall back to merging the demo dataset with a synthetic file.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./difficulty-report-lib.js");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ok  ${msg}`);
  } else {
    failed++;
    console.error(`FAIL  ${msg}`);
  }
}

function approx(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

// ---------------------------------------------------------------------------
// Load datasets
// ---------------------------------------------------------------------------
const samplePath = path.join(__dirname, "sample-data", "ship-v1-vs-v2.results.json");
const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));

const secondPath = "/tmp/sim-results/results.json";
const second = fs.existsSync(secondPath)
  ? JSON.parse(fs.readFileSync(secondPath, "utf8"))
  : null;

console.log(`Loaded demo dataset: ${sample.results.length} games`);
if (second) console.log(`Loaded second dataset: ${second.results.length} games`);
else console.log("Second dataset (/tmp/sim-results/results.json) not found; using synthetic fallback for merge tests");

// ---------------------------------------------------------------------------
// mergePools
// ---------------------------------------------------------------------------
console.log("\nmergePools:");
{
  const pool = lib.mergePools([sample]);
  assert(pool.results.length === sample.results.length, "single file keeps all games");
  assert(
    JSON.stringify(pool.configOrder) === JSON.stringify(["ship-v1", "ship-v2"]),
    "configOrder is first-seen order (ship-v1 first → anchor config)"
  );

  const other = second ?? {
    aggregates: [],
    results: [
      {
        configName: "synthetic", playerCount: 1, botPolicy: "competent", seed: 1,
        outcome: "defeat", finalWave: 2, survivalTicks: 900,
        livesLostByWave: [0, 1, 2], waveClearTicks: [0, 450],
        barrierHpAtWaveStart: [0, 108, 80], totalAlienShots: 50, totalPlayerDeaths: 3,
      },
    ],
  };
  const merged = lib.mergePools([sample, other]);
  assert(
    merged.results.length === sample.results.length + other.results.length,
    "merge of two files keeps every game from both"
  );
  const dims = lib.listDims(merged.results);
  assert(dims.configs.includes("ship-v2"), "merged pool keeps configs from file 1 (ship-v2)");
  const otherConfig = second ? "classic-ramp" : "synthetic";
  assert(dims.configs.includes(otherConfig), `merged pool keeps configs from file 2 (${otherConfig})`);
  assert(merged.configOrder[0] === "ship-v1", "anchor config is still the first config of the first file");
  if (second) {
    const shipV1 = lib.filterResults(merged.results, { configName: "ship-v1" });
    assert(
      shipV1.length ===
        lib.filterResults(sample.results, { configName: "ship-v1" }).length +
          lib.filterResults(second.results, { configName: "ship-v1" }).length,
      "ship-v1 games from both files pool together under one configName"
    );
  }
  assert(lib.mergePools([]).results.length === 0, "merging zero files yields an empty pool");
}

// ---------------------------------------------------------------------------
// computeHazard — known facts from the real data
// ---------------------------------------------------------------------------
console.log("\ncomputeHazard:");
{
  // Known layout bug: ship-v1 at 4 players, competent bots — all 50 games
  // are lost during wave 1, so hazard at wave 1 must be exactly 1.0.
  const v1 = lib.filterResults(sample.results, {
    configName: "ship-v1", playerCount: 4, botPolicy: "competent",
  });
  const hv1 = lib.computeHazard(v1);
  assert(v1.length === 50, "ship-v1 4p competent has 50 games");
  assert(hv1.length === 1, "ship-v1 4p competent: no game gets past wave 1");
  assert(hv1[0].wave === 1 && approx(hv1[0].hazard, 1.0), "ship-v1 4p competent hazard(wave 1) === 1.0 (known wave-1 wipe)");
  assert(hv1[0].reached === 50 && hv1[0].diedIn === 50, "reached=50, diedIn=50 at wave 1");
  assert(hv1[0].lowConfidence === false, "50 at-risk games is not low-confidence");

  // The fix: ship-v2 at 4 players must NOT have hazard 1.0 at wave 1.
  const v2 = lib.filterResults(sample.results, {
    configName: "ship-v2", playerCount: 4, botPolicy: "competent",
  });
  const hv2 = lib.computeHazard(v2);
  assert(hv2.length > 1, "ship-v2 4p competent: games progress past wave 1");
  assert(hv2[0].hazard < 1.0, `ship-v2 4p competent hazard(wave 1) < 1.0 (got ${hv2[0].hazard})`);

  // Invariants on every cell of the demo data.
  const dims = lib.listDims(sample.results);
  let invariantsOk = true;
  for (const c of dims.configs)
    for (const p of dims.playerCounts)
      for (const b of dims.policies) {
        const rows = lib.computeHazard(
          lib.filterResults(sample.results, { configName: c, playerCount: p, botPolicy: b })
        );
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (r.hazard !== null && (r.hazard < 0 || r.hazard > 1)) invariantsOk = false;
          if (i > 0 && rows[i].reached > rows[i - 1].reached) invariantsOk = false; // reached is non-increasing
          if (r.lowConfidence !== r.reached < lib.LOW_CONFIDENCE_N) invariantsOk = false;
        }
      }
  assert(invariantsOk, "all cells: hazard in [0,1], reached non-increasing, low-confidence flag matches threshold");

  assert(lib.computeHazard([]).length === 0, "empty cell yields empty hazard array");
}

// ---------------------------------------------------------------------------
// computeKM — survival-curve properties
// ---------------------------------------------------------------------------
console.log("\ncomputeKM:");
{
  const cell = lib.filterResults(sample.results, {
    configName: "ship-v1", playerCount: 2, botPolicy: "competent",
  });
  const km = lib.computeKM(cell);
  assert(km.n === cell.length, "KM uses every game as an observation");
  assert(km.points[0].t === 0 && km.points[0].s === 1, "KM starts at S(0) = 1");
  let monotone = true;
  for (let i = 1; i < km.points.length; i++) {
    if (km.points[i].s > km.points[i - 1].s + 1e-12) monotone = false;
    if (km.points[i].t < km.points[i - 1].t) monotone = false;
  }
  assert(monotone, "KM is monotone non-increasing in time");

  // Censoring: this cell has 30 capped games (per the aggregates). They must
  // be censored — never counted as deaths — so the final survival level must
  // be well above 0 even though every other game ended in defeat.
  const caps = cell.filter((g) => g.outcome === "cap").length;
  assert(km.censorTimes.length === caps, `censorTimes has one entry per capped game (${caps})`);
  const finalS = km.points[km.points.length - 1].s;
  assert(finalS > 0, `capped games are censored, not deaths: final S = ${finalS.toFixed(3)} > 0`);

  // With NO censoring (a cell where every game is a defeat), KM must end at 0.
  const allDefeat = lib.filterResults(sample.results, {
    configName: "ship-v1", playerCount: 4, botPolicy: "competent",
  });
  assert(allDefeat.every((g) => g.outcome === "defeat"), "ship-v1 4p competent: every game is a defeat");
  const km2 = lib.computeKM(allDefeat);
  assert(approx(km2.points[km2.points.length - 1].s, 0), "uncensored cell: KM reaches 0");

  assert(lib.kmValueAt(km.points, 0) === 1, "kmValueAt(0) === 1");
  assert(
    approx(lib.kmValueAt(km2.points, Number.MAX_SAFE_INTEGER), 0),
    "kmValueAt(huge t) equals the final level"
  );
  const emptyKM = lib.computeKM([]);
  assert(emptyKM.points.length === 0 && emptyKM.n === 0, "empty cell yields empty KM");
}

// ---------------------------------------------------------------------------
// computeFlowProxy
// ---------------------------------------------------------------------------
console.log("\ncomputeFlowProxy:");
{
  // ship-v1 4p competent: aggregate says meanLivesLostWave1 = high (wave-1
  // wipe with 5 shared lives) — the flow proxy must reproduce the aggregate.
  const cell = lib.filterResults(sample.results, {
    configName: "ship-v1", playerCount: 4, botPolicy: "competent",
  });
  const flow = lib.computeFlowProxy(cell);
  const agg = sample.aggregates.find(
    (a) => a.configName === "ship-v1" && a.playerCount === 4 && a.botPolicy === "competent"
  );
  assert(
    approx(flow[0].meanLivesLost, agg.meanLivesLostWave1, 1e-6),
    `flow proxy wave 1 matches aggregate meanLivesLostWave1 (${agg.meanLivesLostWave1})`
  );
  // Note the data story here: hazard(wave 1) is 1.0 but mean lives lost is
  // only ~0.96 — every game ends at tick ~190 by alien INVASION (the 4p grid
  // spawns too low), not by losing all 5 lives. The flow proxy alone would
  // not catch this; the hazard view does. Assert that divergence explicitly.
  assert(
    flow[0].meanLivesLost < 1.5,
    "ship-v1 4p wipe is by invasion, not attrition: lives lost stays low while hazard is 1.0"
  );

  assert(lib.classifyFlow(0.1, 0.2, 1.5) === "boredom", "classifyFlow below band = boredom");
  assert(lib.classifyFlow(0.8, 0.2, 1.5) === "flow", "classifyFlow inside band = flow");
  assert(lib.classifyFlow(2.4, 0.2, 1.5) === "anxiety", "classifyFlow above band = anxiety");
  assert(lib.computeFlowProxy([]).length === 0, "empty cell yields empty flow rows");
}

// ---------------------------------------------------------------------------
// computePacing
// ---------------------------------------------------------------------------
console.log("\ncomputePacing:");
{
  const cell = lib.filterResults(sample.results, {
    configName: "ship-v2", playerCount: 1, botPolicy: "competent",
  });
  const pacing = lib.computePacing(cell);
  assert(pacing.length > 0, "ship-v2 solo competent clears at least one wave");
  const w1 = pacing[0];
  assert(w1.wave === 1 && w1.medianTicks > 0, "wave 1 has a positive median clear time");
  assert(
    approx(w1.medianSeconds, w1.medianTicks / 30),
    "seconds = ticks / 30 (tick rate)"
  );
  assert(w1.n <= cell.length, "contributing game count never exceeds cell size");

  // A cell where nobody clears wave 1 (ship-v1 4p) has no pacing rows at all
  // (waveClearTicks is just [0] for every game).
  const wiped = lib.filterResults(sample.results, {
    configName: "ship-v1", playerCount: 4, botPolicy: "competent",
  });
  assert(lib.computePacing(wiped).length === 0, "cell where no wave is ever cleared yields no pacing rows");
  assert(lib.computePacing([]).length === 0, "empty cell yields empty pacing rows");
}

// ---------------------------------------------------------------------------
// summaryGrid
// ---------------------------------------------------------------------------
console.log("\nsummaryGrid:");
{
  const pool = lib.mergePools([sample]);
  const grid = lib.summaryGrid(pool.results, pool.configOrder, "competent");
  assert(
    grid.anchor && grid.anchor.configName === "ship-v1" && grid.anchor.playerCount === 1,
    "anchor is the solo cell of the first loaded config"
  );
  assert(grid.cells.length === 8, "2 configs × 4 player counts = 8 cells");
  const anchorCell = grid.cells.find((c) => c.isAnchor);
  assert(approx(anchorCell.vsAnchor, 1.0), "anchor cell shows 1.0× vs itself");

  // Validate against the precomputed aggregates shipped in the file.
  let aggOk = true;
  for (const c of grid.cells) {
    const agg = sample.aggregates.find(
      (a) => a.configName === c.configName && a.playerCount === c.playerCount && a.botPolicy === "competent"
    );
    if (!agg) { aggOk = false; continue; }
    if (c.games !== agg.games) aggOk = false;
    if (!approx(c.medianFinalWave, agg.finalWave.median)) aggOk = false;
    if (!approx(c.defeatBeforeWave2Rate, agg.defeatBeforeWave2Rate, 1e-6)) aggOk = false;
    if (!approx(c.capRate, agg.outcomes.cap / agg.games, 1e-6)) aggOk = false;
  }
  assert(aggOk, "every summary cell matches the sim CLI's own precomputed aggregates");

  // Known fact: ship-v1 4p competent — 100% defeat before wave 2, 0% capped.
  const v14p = grid.cells.find((c) => c.configName === "ship-v1" && c.playerCount === 4);
  assert(approx(v14p.defeatBeforeWave2Rate, 1.0), "ship-v1 4p: 100% of games lost before wave 2");
  assert(approx(v14p.capRate, 0), "ship-v1 4p: 0% of games reach the tick cap");

  // Empty/missing cells: a config that exists at no player count 7, a bogus policy.
  assert(lib.summarizeCell([]) === null, "summarizeCell of an empty cell is null");
  const emptyGrid = lib.summaryGrid(pool.results, pool.configOrder, "no-such-policy");
  assert(emptyGrid.cells.length === 0 && emptyGrid.anchor === null, "unknown bot policy yields an empty grid, no anchor");
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
