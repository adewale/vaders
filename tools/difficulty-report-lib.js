/**
 * difficulty-report-lib.js
 *
 * Pure data transforms for tools/difficulty-report.html.
 * No DOM, no Chart.js, no I/O — every function here takes plain data and
 * returns plain data, so it can be unit-tested with bun:
 *
 *   bun tools/difficulty-report-test.js
 *
 * Loaded by the HTML via <script src="difficulty-report-lib.js"> (attaches
 * globalThis.DifficultyReportLib) and by the test via require() (CommonJS).
 *
 * Input schema (one sim results file, produced by worker/src/sim CLI):
 *   {
 *     aggregates: [...],   // precomputed per-cell stats (not required here)
 *     results: [{
 *       configName, playerCount, botPolicy, seed,
 *       outcome: "defeat" | "cap",
 *       finalWave, survivalTicks,
 *       livesLostByWave: number[],      // index = wave, [0] unused
 *       waveClearTicks: number[],       // index = wave, [0] unused; only cleared waves
 *       barrierHpAtWaveStart: number[],
 *       totalAlienShots, totalPlayerDeaths
 *     }]
 *   }
 *
 * Statistical grounding:
 *  - Per-wave hazard follows Aponte, Levieux & Natkin (2011): difficulty as
 *    P(failure at task). Here the "task" is surviving wave w given you
 *    reached it. Cap-outcome games that reached wave w count as at-risk but
 *    not as deaths (right-censoring within the wave).
 *  - Kaplan-Meier survival treats tick-capped games as right-censored at
 *    their survivalTicks: they reduce the at-risk count after their censor
 *    time but never count as deaths.
 */
(function (root, factory) {
  const lib = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = lib;
  } else {
    root.DifficultyReportLib = lib;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TICK_HZ = 30;
  const LOW_CONFIDENCE_N = 10; // fewer than this many at-risk games = low confidence

  // ---------------------------------------------------------------------
  // Merging & filtering
  // ---------------------------------------------------------------------

  /**
   * Merge several parsed results files into one pool.
   * Keeps every game; configOrder records first-seen order of configName
   * across files (the first config of the first file is the comparison
   * anchor in the report).
   */
  function mergePools(files) {
    const results = [];
    const aggregates = [];
    const configOrder = [];
    for (const file of files) {
      if (!file || !Array.isArray(file.results)) continue;
      for (const r of file.results) {
        results.push(r);
        if (!configOrder.includes(r.configName)) configOrder.push(r.configName);
      }
      if (Array.isArray(file.aggregates)) aggregates.push(...file.aggregates);
    }
    return { results, aggregates, configOrder };
  }

  /**
   * Discover the dimensions present in a result pool.
   * configs preserve first-seen order; playerCounts and policies are sorted.
   */
  function listDims(results) {
    const configs = [];
    const playerCounts = new Set();
    const policies = new Set();
    for (const r of results) {
      if (!configs.includes(r.configName)) configs.push(r.configName);
      playerCounts.add(r.playerCount);
      policies.add(r.botPolicy);
    }
    return {
      configs,
      playerCounts: [...playerCounts].sort((a, b) => a - b),
      policies: [...policies].sort(),
    };
  }

  /** Filter results by any subset of {configName, playerCount, botPolicy}. */
  function filterResults(results, sel) {
    return results.filter(
      (r) =>
        (sel.configName === undefined || r.configName === sel.configName) &&
        (sel.playerCount === undefined || r.playerCount === sel.playerCount) &&
        (sel.botPolicy === undefined || r.botPolicy === sel.botPolicy)
    );
  }

  // ---------------------------------------------------------------------
  // Small numeric helpers
  // ---------------------------------------------------------------------

  function median(values) {
    if (values.length === 0) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function mean(values) {
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function ticksToSeconds(ticks) {
    return ticks / TICK_HZ;
  }

  // ---------------------------------------------------------------------
  // View 1: per-wave hazard (Aponte-style failure probability)
  // ---------------------------------------------------------------------

  /**
   * Per-wave hazard for one cell of filtered games:
   *   reached(w) = games with finalWave >= w
   *   diedIn(w)  = defeats with finalWave == w
   *   hazard(w)  = diedIn(w) / reached(w)
   * Returns [{wave, reached, diedIn, hazard, lowConfidence}] for waves
   * 1..max(finalWave). Empty array when there are no games.
   */
  function computeHazard(games) {
    if (games.length === 0) return [];
    const maxWave = Math.max(...games.map((g) => g.finalWave));
    const rows = [];
    for (let w = 1; w <= maxWave; w++) {
      const reached = games.filter((g) => g.finalWave >= w).length;
      const diedIn = games.filter(
        (g) => g.outcome === "defeat" && g.finalWave === w
      ).length;
      rows.push({
        wave: w,
        reached,
        diedIn,
        hazard: reached > 0 ? diedIn / reached : null,
        lowConfidence: reached < LOW_CONFIDENCE_N,
      });
    }
    return rows;
  }

  // ---------------------------------------------------------------------
  // View 2: Kaplan-Meier survival
  // ---------------------------------------------------------------------

  /**
   * Kaplan-Meier survival estimate over game time (ticks).
   * Each game is an observation (t = survivalTicks, event = outcome==="defeat").
   * Cap-outcome games are right-censored at their survivalTicks.
   *
   * Returns {
   *   points: [{t, s}],      // step points; starts at {t:0, s:1};
   *                          // render with step-after interpolation
   *   censorTimes: number[], // tick times of censored observations
   *   n: number              // total observations
   * }
   */
  function computeKM(games) {
    if (games.length === 0) return { points: [], censorTimes: [], n: 0 };
    const obs = games
      .map((g) => ({ t: g.survivalTicks, event: g.outcome === "defeat" }))
      .sort((a, b) => a.t - b.t);
    const n = obs.length;
    const maxT = obs[n - 1].t;

    // Distinct event (death) times in ascending order.
    const deathTimes = [...new Set(obs.filter((o) => o.event).map((o) => o.t))].sort(
      (a, b) => a - b
    );

    const points = [{ t: 0, s: 1 }];
    let s = 1;
    for (const t of deathTimes) {
      const atRisk = obs.filter((o) => o.t >= t).length;
      const deaths = obs.filter((o) => o.event && o.t === t).length;
      if (atRisk > 0) s *= 1 - deaths / atRisk;
      points.push({ t, s });
    }
    // Extend the curve flat to the last observed time (censored tail).
    if (points[points.length - 1].t < maxT) points.push({ t: maxT, s });

    const censorTimes = obs.filter((o) => !o.event).map((o) => o.t);
    return { points, censorTimes, n };
  }

  /** Survival value of a KM step function at time t (step-after semantics). */
  function kmValueAt(points, t) {
    let s = 1;
    for (const p of points) {
      if (p.t <= t) s = p.s;
      else break;
    }
    return s;
  }

  // ---------------------------------------------------------------------
  // View 3: flow-channel challenge proxy
  // ---------------------------------------------------------------------

  /**
   * Challenge proxy per wave: mean lives lost during wave w among games that
   * reached wave w. Missing livesLostByWave entries count as 0.
   * Returns [{wave, meanLivesLost, reached, lowConfidence}].
   */
  function computeFlowProxy(games) {
    if (games.length === 0) return [];
    const maxWave = Math.max(...games.map((g) => g.finalWave));
    const rows = [];
    for (let w = 1; w <= maxWave; w++) {
      const reachedGames = games.filter((g) => g.finalWave >= w);
      const losses = reachedGames.map((g) =>
        Array.isArray(g.livesLostByWave) ? g.livesLostByWave[w] ?? 0 : 0
      );
      rows.push({
        wave: w,
        meanLivesLost: mean(losses),
        reached: reachedGames.length,
        lowConfidence: reachedGames.length < LOW_CONFIDENCE_N,
      });
    }
    return rows;
  }

  /** Classify a flow-proxy value against a [low, high] flow band. */
  function classifyFlow(value, low, high) {
    if (value === null || value === undefined) return "unknown";
    if (value < low) return "boredom";
    if (value > high) return "anxiety";
    return "flow";
  }

  // ---------------------------------------------------------------------
  // View 4: wave pacing
  // ---------------------------------------------------------------------

  /**
   * Median ticks taken to clear each wave (only games that actually cleared
   * wave w contribute — i.e. waveClearTicks[w] exists and is > 0).
   * Returns [{wave, medianTicks, medianSeconds, n}]; waves nobody cleared
   * yield medianTicks === null.
   */
  function computePacing(games) {
    if (games.length === 0) return [];
    let maxWave = 0;
    for (const g of games) {
      if (Array.isArray(g.waveClearTicks)) {
        maxWave = Math.max(maxWave, g.waveClearTicks.length - 1);
      }
    }
    const rows = [];
    for (let w = 1; w <= maxWave; w++) {
      const ticks = games
        .map((g) =>
          Array.isArray(g.waveClearTicks) ? g.waveClearTicks[w] : undefined
        )
        .filter((t) => typeof t === "number" && t > 0);
      const m = median(ticks);
      rows.push({
        wave: w,
        medianTicks: m,
        medianSeconds: m === null ? null : ticksToSeconds(m),
        n: ticks.length,
      });
    }
    return rows;
  }

  // ---------------------------------------------------------------------
  // View 5: summary cells
  // ---------------------------------------------------------------------

  /**
   * Summary stats for one cell of filtered games. Returns null for empty cells.
   */
  function summarizeCell(games) {
    if (games.length === 0) return null;
    const defeats = games.filter((g) => g.outcome === "defeat");
    const caps = games.filter((g) => g.outcome === "cap");
    return {
      games: games.length,
      medianFinalWave: median(games.map((g) => g.finalWave)),
      medianSurvivalSeconds: ticksToSeconds(median(games.map((g) => g.survivalTicks))),
      defeatBeforeWave2Rate:
        defeats.filter((g) => g.finalWave < 2).length / games.length,
      capRate: caps.length / games.length,
    };
  }

  /**
   * Build the full summary grid for a pool at one bot policy.
   * Anchor = the solo (1-player) cell of the FIRST loaded config; every cell
   * gets vsAnchor = its medianFinalWave / anchor's medianFinalWave (null when
   * no anchor exists).
   *
   * Returns { anchor: {configName, playerCount} | null,
   *           cells: [{configName, playerCount, isAnchor, vsAnchor, ...summary}] }
   */
  function summaryGrid(results, configOrder, botPolicy) {
    const pool = filterResults(results, { botPolicy });
    const dims = listDims(pool);
    const configs = configOrder.filter((c) => dims.configs.includes(c));

    let anchor = null;
    let anchorMedian = null;
    if (configs.length > 0) {
      const anchorGames = filterResults(pool, {
        configName: configs[0],
        playerCount: 1,
      });
      const s = summarizeCell(anchorGames);
      if (s && s.medianFinalWave > 0) {
        anchor = { configName: configs[0], playerCount: 1 };
        anchorMedian = s.medianFinalWave;
      }
    }

    const cells = [];
    for (const configName of configs) {
      for (const playerCount of dims.playerCounts) {
        const games = filterResults(pool, { configName, playerCount });
        const s = summarizeCell(games);
        if (!s) continue;
        cells.push({
          configName,
          playerCount,
          isAnchor:
            anchor !== null &&
            anchor.configName === configName &&
            anchor.playerCount === playerCount,
          vsAnchor: anchorMedian ? s.medianFinalWave / anchorMedian : null,
          ...s,
        });
      }
    }
    return { anchor, cells };
  }

  return {
    TICK_HZ,
    LOW_CONFIDENCE_N,
    mergePools,
    listDims,
    filterResults,
    median,
    mean,
    ticksToSeconds,
    computeHazard,
    computeKM,
    kmValueAt,
    computeFlowProxy,
    classifyFlow,
    computePacing,
    summarizeCell,
    summaryGrid,
  };
});
