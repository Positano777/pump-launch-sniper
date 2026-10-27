import { decide } from './policy.mjs';

const HORIZON_MS = 30 * 60 * 1000;

function number(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${name} must be a finite number from ${min} to ${max}`);
  }
  return value;
}

function quote(raw, observedAtMs) {
  if (!raw || typeof raw !== 'object') return null;
  const q = {
    entryPriceSol: number(raw.entryPriceSol, 'entryPriceSol', Number.MIN_VALUE, 1_000_000),
    exitPriceSolAt30m: number(raw.exitPriceSolAt30m, 'exitPriceSolAt30m', 0, 1_000_000),
    entryQuoteAtMs: number(raw.entryQuoteAtMs, 'entryQuoteAtMs', 0, Number.MAX_SAFE_INTEGER),
    exitQuoteAtMs: number(raw.exitQuoteAtMs, 'exitQuoteAtMs', 0, Number.MAX_SAFE_INTEGER),
    entrySlippageBps: number(raw.entrySlippageBps, 'entrySlippageBps', 0, 10_000),
    exitSlippageBps: number(raw.exitSlippageBps, 'exitSlippageBps', 0, 10_000),
    buyFeeBps: number(raw.buyFeeBps, 'buyFeeBps', 0, 10_000),
    sellFeeBps: number(raw.sellFeeBps, 'sellFeeBps', 0, 10_000),
    fixedCostsSol: number(raw.fixedCostsSol, 'fixedCostsSol', 0, 1_000),
  };
  if (q.entryQuoteAtMs > observedAtMs) throw new TypeError('entry quote is future data');
  if (q.exitQuoteAtMs !== observedAtMs + HORIZON_MS) throw new TypeError('exit quote must be at the 30-minute horizon');
  return q;
}

export function paperReplay(rows, { bankrollSol = 1, maxOpenPositions = 3, maxEntryQuoteAgeMs = 1000,
  maxSessionLossSol = bankrollSol * 0.1, maxTotalSpendSol = bankrollSol } = {}) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  number(bankrollSol, 'bankrollSol', Number.MIN_VALUE, 1_000_000);
  number(maxOpenPositions, 'maxOpenPositions', 1, 1_000);
  number(maxEntryQuoteAgeMs, 'maxEntryQuoteAgeMs', 0, 60_000);
  number(maxSessionLossSol, 'maxSessionLossSol', 0, bankrollSol);
  number(maxTotalSpendSol, 'maxTotalSpendSol', 0, bankrollSol * 100);
  if (!Number.isInteger(maxOpenPositions)) throw new TypeError('maxOpenPositions must be an integer');
  const seen = new Set(), positions = [], trades = [], skipped = [];
  let cashSol = bankrollSol, lastObservedAtMs = -1, acceptedSignals = 0, quoteCoverage = 0;
  let realizedPnlSol = 0, totalSpendSol = 0;
  function settleUntil(time) {
    for (let i = positions.length - 1; i >= 0; i--) {
      const trade = positions[i];
      if (trade.exitAtMs > time) continue;
      cashSol += trade.proceedsSol;
      realizedPnlSol += trade.netPnlSol;
      trades.push(trade);
      positions.splice(i, 1);
    }
  }
  for (const row of rows) {
    const decision = decide(row.signal);
    const time = row.signal.observedAtMs;
    if (time < lastObservedAtMs) throw new TypeError('paper input must be chronological by observedAtMs');
    lastObservedAtMs = time;
    settleUntil(time);
    if (seen.has(decision.mint)) { skipped.push({ mint: decision.mint, reason: 'DUPLICATE_MINT' }); continue; }
    seen.add(decision.mint);
    if (decision.verdict !== 'BUY') continue;
    acceptedSignals++;
    const q = quote(row.outcome?.paperQuote, time);
    if (!q) { skipped.push({ mint: decision.mint, reason: 'QUOTE_MISSING' }); continue; }
    quoteCoverage++;
    if (time - q.entryQuoteAtMs > maxEntryQuoteAgeMs) {
      skipped.push({ mint: decision.mint, reason: 'ENTRY_QUOTE_STALE' }); continue;
    }
    if (q.entrySlippageBps > decision.proposal.maxSlippageBps) {
      skipped.push({ mint: decision.mint, reason: 'SLIPPAGE_CAP' }); continue;
    }
    if (positions.length >= maxOpenPositions) { skipped.push({ mint: decision.mint, reason: 'POSITION_CAP' }); continue; }
    const spendSol = decision.proposal.maxSpendSol;
    if (cashSol < spendSol + q.fixedCostsSol) { skipped.push({ mint: decision.mint, reason: 'INSUFFICIENT_PAPER_CASH' }); continue; }
    if (realizedPnlSol <= -maxSessionLossSol && (totalSpendSol > 0 || maxSessionLossSol === 0)) {
      skipped.push({ mint: decision.mint, reason: 'SESSION_LOSS_LIMIT' }); continue;
    }
    if (totalSpendSol + spendSol > maxTotalSpendSol) {
      skipped.push({ mint: decision.mint, reason: 'TOTAL_SPEND_LIMIT' }); continue;
    }
    cashSol -= spendSol + q.fixedCostsSol;
    totalSpendSol += spendSol;
    const tokens = spendSol * (1 - q.buyFeeBps / 10_000) / (q.entryPriceSol * (1 + q.entrySlippageBps / 10_000));
    const proceedsSol = tokens * q.exitPriceSolAt30m * (1 - q.sellFeeBps / 10_000) * (1 - q.exitSlippageBps / 10_000);
    positions.push({ mint: decision.mint, entryAtMs: time, exitAtMs: q.exitQuoteAtMs,
      spendSol, fixedCostsSol: q.fixedCostsSol, tokens, proceedsSol,
      netPnlSol: proceedsSol - spendSol - q.fixedCostsSol, quoteSource: 'supplied' });
  }
  settleUntil(Number.MAX_SAFE_INTEGER);
  const netPnlSol = trades.reduce((sum, trade) => sum + trade.netPnlSol, 0);
  return { schema: 'positano.sniper-paper.v1', startingBankrollSol: bankrollSol, endingCashSol: cashSol,
    netPnlSol, returnPct: netPnlSol / bankrollSol * 100, totalSpendSol,
    riskLimits: { maxSessionLossSol, maxTotalSpendSol, maxOpenPositions }, acceptedSignals, quoteCoverage,
    quoteCoveragePct: acceptedSignals ? quoteCoverage / acceptedSignals * 100 : null,
    complete: quoteCoverage === acceptedSignals, trades, skipped,
    caveats: ['Hypothetical 30-minute trades from supplied quotes; there is no live order, observed fill, or verified market data.',
      'Return is for available quotes only. If complete=false, it cannot represent the strategy on the full cohort.',
      'Fees, slippage and fixed costs are supplied by the dataset. Missing or inaccurate costs distort results.'] };
}
