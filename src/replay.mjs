import { performance } from 'node:perf_hooks';
import { decide } from './policy.mjs';

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((p / 100) * sorted.length) - 1];
}

export function replay(rows) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  const seen = new Set(), decisions = [], localDecisionMs = [];
  const counts = { BUY: 0, SKIP: 0, ABSTAIN: 0, duplicate: 0, labeled: 0, truePositive: 0, falsePositive: 0, falseNegative: 0, trueNegative: 0 };
  for (const row of rows) {
    const start = performance.now();
    // Pass only the signal: future outcome fields are deliberately inaccessible to the policy.
    const decision = decide(row.signal);
    const key = decision.mint;
    if (seen.has(key)) { counts.duplicate++; continue; }
    seen.add(key);
    localDecisionMs.push(performance.now() - start);
    counts[decision.verdict]++;
    const label = row.outcome?.favorableAt30m;
    if (typeof label === 'boolean') {
      counts.labeled++;
      if (decision.verdict === 'BUY' && label) counts.truePositive++;
      if (decision.verdict === 'BUY' && !label) counts.falsePositive++;
      if (decision.verdict === 'SKIP' && label) counts.falseNegative++;
      if (decision.verdict === 'SKIP' && !label) counts.trueNegative++;
    }
    decisions.push(decision);
  }
  const denomPrecision = counts.truePositive + counts.falsePositive;
  const denomRecall = counts.truePositive + counts.falseNegative;
  const denomFpr = counts.falsePositive + counts.trueNegative;
  return { schema: 'positano.sniper-replay.v1', counts,
    metrics: { precision: denomPrecision ? counts.truePositive / denomPrecision : null,
      recall: denomRecall ? counts.truePositive / denomRecall : null,
      falsePositiveRate: denomFpr ? counts.falsePositive / denomFpr : null,
      abstentionRate: decisions.length ? counts.ABSTAIN / decisions.length : null,
      localDecisionMs: { p50: percentile(localDecisionMs, 50), p95: percentile(localDecisionMs, 95), p99: percentile(localDecisionMs, 99) } },
    caveats: ['Local decision time excludes event delivery, model inference, signing, network submission and confirmation.',
      'The 30-minute label is supplied by the dataset; this tool does not verify prices or calculate trade PnL.',
      'Abstentions are excluded from precision, recall and false-positive-rate denominators.'], decisions };
}
