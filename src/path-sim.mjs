import { decide } from './policy.mjs';

export const DEFAULT_SCENARIOS = Object.freeze([
  Object.freeze({ name: 'illustrative-base', decisionDelayMs: 0, maxEntryDelayMs: 5000, maxExitGapMs: 5000,
    maxHoldMs: 1_800_000, stopLossPct: 25, takeProfitPct: 60, trailingStopPct: 20,
    entrySlippageBps: 50, exitSlippageBps: 50, buyFeeBps: 100, sellFeeBps: 100,
    fixedCostsSol: 0.000005, entrySucceeds: true }),
  Object.freeze({ name: 'illustrative-stress', decisionDelayMs: 1500, maxEntryDelayMs: 10000, maxExitGapMs: 5000,
    maxHoldMs: 1_800_000, stopLossPct: 25, takeProfitPct: 60, trailingStopPct: 20,
    entrySlippageBps: 300, exitSlippageBps: 300, buyFeeBps: 100, sellFeeBps: 100,
    fixedCostsSol: 0.00002, entrySucceeds: true }),
  Object.freeze({ name: 'illustrative-failed-entry', decisionDelayMs: 0, maxEntryDelayMs: 5000, maxExitGapMs: 5000,
    maxHoldMs: 1_800_000, stopLossPct: 25, takeProfitPct: 60, trailingStopPct: 20,
    entrySlippageBps: 50, exitSlippageBps: 50, buyFeeBps: 100, sellFeeBps: 100,
    fixedCostsSol: 0.000005, entrySucceeds: false }),
]);

function finite(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${name} must be a finite number from ${min} to ${max}`);
  }
  return value;
}

function validateScenario(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.name !== 'string' || !raw.name.trim()) {
    throw new TypeError('scenario needs a name');
  }
  const s = { name: raw.name,
    decisionDelayMs: finite(raw.decisionDelayMs, 'decisionDelayMs', 0, 60_000),
    maxEntryDelayMs: finite(raw.maxEntryDelayMs, 'maxEntryDelayMs', 0, 60_000),
    maxExitGapMs: finite(raw.maxExitGapMs, 'maxExitGapMs', 0, 60_000),
    maxHoldMs: finite(raw.maxHoldMs, 'maxHoldMs', 1000, 86_400_000),
    stopLossPct: finite(raw.stopLossPct, 'stopLossPct', 0, 100),
    takeProfitPct: finite(raw.takeProfitPct, 'takeProfitPct', 0, 10_000),
    trailingStopPct: finite(raw.trailingStopPct, 'trailingStopPct', 0, 100),
    entrySlippageBps: finite(raw.entrySlippageBps, 'entrySlippageBps', 0, 10_000),
    exitSlippageBps: finite(raw.exitSlippageBps, 'exitSlippageBps', 0, 10_000),
    buyFeeBps: finite(raw.buyFeeBps, 'buyFeeBps', 0, 10_000),
    sellFeeBps: finite(raw.sellFeeBps, 'sellFeeBps', 0, 10_000),
    fixedCostsSol: finite(raw.fixedCostsSol, 'fixedCostsSol', 0, 100),
    entrySucceeds: raw.entrySucceeds === true,
  };
  if (typeof raw.entrySucceeds !== 'boolean') throw new TypeError('entrySucceeds must be boolean');
  return s;
}

function validatePath(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100_000) throw new TypeError('pricePath must have 1 to 100000 ticks');
  let previous = -1;
  return raw.map((tick) => {
    if (!tick || typeof tick !== 'object') throw new TypeError('pricePath tick must be an object');
    const atMs = finite(tick.atMs, 'tick.atMs', 0, Number.MAX_SAFE_INTEGER);
    const priceSol = finite(tick.priceSol, 'tick.priceSol', 0, 1_000_000);
    if (!Number.isSafeInteger(atMs) || atMs <= previous) throw new TypeError('pricePath timestamps must increase');
    previous = atMs;
    return { atMs, priceSol };
  });
}

export function simulatePath(row, rawScenario = DEFAULT_SCENARIOS[0]) {
  const scenario = validateScenario(rawScenario);
  const decision = decide(row.signal);
  const base = { mint: decision.mint, scenario: scenario.name, verdict: decision.verdict };
  if (decision.verdict !== 'BUY') return { ...base, status: decision.verdict, reasons: decision.reasons, netPnlSol: null };
  if (scenario.entrySlippageBps > decision.proposal.maxSlippageBps) {
    return { ...base, status: 'ENTRY_SLIPPAGE_CAP', netPnlSol: null };
  }
  if (!row.outcome?.pricePath) return { ...base, status: 'PRICE_PATH_MISSING', netPnlSol: null };
  const path = validatePath(row.outcome.pricePath);
  const target = row.signal.observedAtMs + scenario.decisionDelayMs;
  const first = path.findIndex((tick) => tick.atMs >= target);
  if (first < 0 || path[first].atMs - target > scenario.maxEntryDelayMs) {
    return { ...base, status: 'ENTRY_QUOTE_UNAVAILABLE', netPnlSol: null };
  }
  if (path[first].priceSol <= 0) return { ...base, status: 'ENTRY_PRICE_ZERO', netPnlSol: null };
  if (!scenario.entrySucceeds) {
    return { ...base, status: 'FAILED_ENTRY', netPnlSol: -scenario.fixedCostsSol,
      costs: { fixedCostsSol: scenario.fixedCostsSol } };
  }
  const spendSol = decision.proposal.maxSpendSol;
  const entry = path[first];
  const tokens = spendSol * (1 - scenario.buyFeeBps / 10_000) /
    (entry.priceSol * (1 + scenario.entrySlippageBps / 10_000));
  const exitProceeds = (price) => tokens * price * (1 - scenario.sellFeeBps / 10_000) *
    (1 - scenario.exitSlippageBps / 10_000);
  const netAt = (price) => exitProceeds(price) - spendSol - scenario.fixedCostsSol;
  const pctAt = (price) => netAt(price) / spendSol * 100;
  let highWaterPct = pctAt(entry.priceSol);
  const deadline = entry.atMs + scenario.maxHoldMs;
  for (let i = first + 1; i < path.length; i++) {
    const tick = path[i], returnPct = pctAt(tick.priceSol);
    highWaterPct = Math.max(highWaterPct, returnPct);
    let exitReason = null;
    if (returnPct <= -scenario.stopLossPct) exitReason = 'STOP_LOSS';
    else if (returnPct >= scenario.takeProfitPct) exitReason = 'TAKE_PROFIT';
    else if (highWaterPct > 0 && returnPct <= highWaterPct - scenario.trailingStopPct) exitReason = 'TRAILING_STOP';
    else if (tick.atMs >= deadline) exitReason = 'TIMEOUT';
    if (!exitReason) continue;
    if (tick.atMs >= deadline && tick.atMs - deadline > scenario.maxExitGapMs) {
      return { ...base, status: 'EXIT_QUOTE_GAP', netPnlSol: null, entryAtMs: entry.atMs };
    }
    return { ...base, status: 'CLOSED', exitReason, entryAtMs: entry.atMs, exitAtMs: tick.atMs,
      spendSol, tokens, entryPriceSol: entry.priceSol, exitPriceSol: tick.priceSol,
      netPnlSol: netAt(tick.priceSol), returnPct };
  }
  return { ...base, status: 'UNRESOLVED', netPnlSol: null, entryAtMs: entry.atMs };
}

export function simulateScenarios(rows, scenarios = DEFAULT_SCENARIOS) {
  if (!Array.isArray(rows) || !Array.isArray(scenarios)) throw new TypeError('rows and scenarios must be arrays');
  return { schema: 'positano.sniper-path-sim.v1', scenarios: scenarios.map((scenario) => {
    const seen = new Set();
    const results = rows.map((row) => {
      const result = simulatePath(row, scenario);
      if (seen.has(result.mint)) return { mint: result.mint, scenario: scenario.name,
        verdict: result.verdict, status: 'DUPLICATE_MINT', netPnlSol: null };
      seen.add(result.mint);
      return result;
    });
    const closed = results.filter((x) => x.status === 'CLOSED' || x.status === 'FAILED_ENTRY');
    return { name: scenario.name, results, measuredResults: closed.length,
      knownNetPnlSol: closed.reduce((sum, x) => sum + x.netPnlSol, 0),
      unresolved: results.filter((x) => ['PRICE_PATH_MISSING', 'ENTRY_QUOTE_UNAVAILABLE', 'ENTRY_PRICE_ZERO', 'EXIT_QUOTE_GAP', 'UNRESOLVED'].includes(x.status)).length };
  }), caveats: ['Paths and costs are supplied, not fetched or verified. Synthetic defaults do not predict live fills.',
    'Each candidate is simulated independently; cash and overlapping positions are not modeled here.',
    'Ticks can miss between-tick extremes. Unknown or incomplete paths have no fabricated PnL.'] };
}
