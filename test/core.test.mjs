import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decide, DEFAULT_POLICY } from '../src/policy.mjs';
import { replay } from '../src/replay.mjs';
import { paperReplay } from '../src/paper.mjs';
import { latencyReport } from '../src/latency.mjs';
import { analyzeWithModel } from '../src/models.mjs';

const rows = (await readFile(new URL('../examples/launches.synthetic.jsonl', import.meta.url), 'utf8'))
  .trim().split('\n').map(JSON.parse);

test('policy abstains when launch evidence is incomplete', () => {
  const result = decide(rows[2].signal);
  assert.equal(result.verdict, 'ABSTAIN');
  assert.equal(result.proposal, null);
  assert.ok(result.reasons.includes('EVIDENCE_INCOMPLETE'));
});

test('policy rejects concentrated launches and caps accepted proposals', () => {
  assert.equal(decide(rows[1].signal).verdict, 'SKIP');
  const result = decide(rows[0].signal);
  assert.equal(result.verdict, 'BUY');
  assert.equal(result.proposal.maxSpendSol, 0.05);
  assert.equal(result.proposal.maxSlippageBps, 300);
});

test('outcomes cannot leak into decisions and duplicate mint is counted once', () => {
  const result = replay([rows[0], { ...rows[0], outcome: { favorableAt30m: false } }, rows[1], rows[2]]);
  assert.equal(result.counts.duplicate, 1);
  assert.equal(result.counts.truePositive, 1);
  assert.equal(result.counts.trueNegative, 1);
  assert.equal(result.counts.ABSTAIN, 1);
  assert.equal(result.metrics.precision, 1);
});

test('model request has only public signal and cannot alter decision', async () => {
  let sent;
  const fakeFetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: 'Caution: incomplete coverage.' } }] }) };
  };
  const result = await analyzeWithModel('muse', rows[0].signal, { env: { MODEL_API_KEY: 'test-only' }, fetcher: fakeFetch });
  assert.equal(result.provider, 'muse');
  assert.equal(sent.model, 'muse-spark-1.3');
  assert.ok(!JSON.stringify(sent).includes('favorableAt30m'));
  assert.equal(decide(rows[0].signal).verdict, 'BUY');
});

test('malformed evidence fails closed', () => {
  assert.throws(() => decide({ ...rows[0].signal, topTenPct: Number.NaN }), /topTenPct/);
  assert.throws(() => decide({ ...rows[0].signal, launchAtMs: 999999 }), /precedes launch/);
  assert.throws(() => decide(rows[0].signal, { ...DEFAULT_POLICY, maxSpendSol: Infinity }), /maxSpendSol/);
  assert.throws(() => replay([{ ...rows[0], outcome: { favorableAt30m: true } }]), /labelDefinition/);
});

test('paper replay accounts for both fees, slippage, fixed costs and cash', () => {
  const result = paperReplay(rows);
  assert.equal(result.complete, true);
  assert.equal(result.trades.length, 1);
  const trade = result.trades[0];
  const expectedTokens = 0.05 * 0.99 / (0.000001 * 1.005);
  const expectedProceeds = expectedTokens * 0.0000011 * 0.99 * 0.995;
  assert.ok(Math.abs(trade.tokens - expectedTokens) < 1e-6);
  assert.ok(Math.abs(result.netPnlSol - (expectedProceeds - 0.05 - 0.000005)) < 1e-10);
  assert.ok(Math.abs(result.endingCashSol - (1 + result.netPnlSol)) < 1e-10);
});

test('paper replay refuses future entry prices and out-of-order rows', () => {
  const badQuote = structuredClone(rows[0]);
  badQuote.outcome.paperQuote.entryQuoteAtMs = badQuote.signal.observedAtMs + 1;
  assert.throws(() => paperReplay([badQuote]), /future data/);
  assert.throws(() => paperReplay([rows[1], rows[0]]), /chronological/);
});

test('missing paper quotes are visible as incomplete coverage', () => {
  const missing = structuredClone(rows[0]);
  delete missing.outcome.paperQuote;
  const result = paperReplay([missing]);
  assert.equal(result.complete, false);
  assert.equal(result.quoteCoverage, 0);
  assert.equal(result.trades.length, 0);
  assert.equal(result.skipped[0].reason, 'QUOTE_MISSING');
});

test('paper bankroll and entry slippage caps block hypothetical entry', () => {
  assert.equal(paperReplay([rows[0]], { bankrollSol: 0.01 }).skipped[0].reason, 'INSUFFICIENT_PAPER_CASH');
  const highSlip = structuredClone(rows[0]);
  highSlip.outcome.paperQuote.entrySlippageBps = 301;
  assert.equal(paperReplay([highSlip]).skipped[0].reason, 'SLIPPAGE_CAP');
  const stale = structuredClone(rows[0]);
  stale.outcome.paperQuote.entryQuoteAtMs = stale.signal.observedAtMs - 1001;
  assert.equal(paperReplay([stale]).skipped[0].reason, 'ENTRY_QUOTE_STALE');
});

test('latency report separates event, decision, submission and confirmation', () => {
  const report = latencyReport([{ timing: { eventAvailableAtMs: 1000, ingestedAtMs: 1010,
    decisionAtMs: 1012, submittedAtMs: 1020, confirmedAtMs: 1420 } }]);
  assert.equal(report.complete, 1);
  assert.equal(report.stagesMs.eventToIngest.p50, 10);
  assert.equal(report.stagesMs.ingestToDecision.p50, 2);
  assert.equal(report.stagesMs.decisionToSubmission.p50, 8);
  assert.equal(report.stagesMs.submissionToConfirmation.p50, 400);
  assert.equal(report.stagesMs.eventToConfirmation.p50, 420);
  assert.throws(() => latencyReport([{ timing: { eventAvailableAtMs: 1000, ingestedAtMs: 999 } }]), /out of order/);
  assert.equal(latencyReport(rows).complete, 0);
});
