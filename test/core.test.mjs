import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decide, DEFAULT_POLICY } from '../src/policy.mjs';
import { replay } from '../src/replay.mjs';
import { paperReplay } from '../src/paper.mjs';
import { latencyReport } from '../src/latency.mjs';
import { attachLaunchEvidence } from '../src/evidence.mjs';
import { simulatePath, simulateScenarios, DEFAULT_SCENARIOS } from '../src/path-sim.mjs';
import { decodePumpCreation, PUMP_PROGRAM } from '../src/pump-tx.mjs';
import { collectPumpCreations, validateWsUrl } from '../src/collector.mjs';
import { ReadRpc } from '../src/rpc-client.mjs';
import { scanLaunchSlot } from '../src/launch-slot.mjs';
import { cohortReport } from '../src/cohort.mjs';
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

test('paper session stops new entries after realized loss or spend cap', () => {
  const first = structuredClone(rows[0]);
  first.outcome.paperQuote.exitPriceSolAt30m = 0.0000001;
  const second = structuredClone(rows[0]);
  second.signal.mint = rows[1].signal.mint;
  second.signal.slot = 101;
  second.signal.observedAtMs = 1_812_000;
  second.signal.launchAtMs = 1_811_000;
  second.outcome.paperQuote.entryQuoteAtMs = 1_812_000;
  second.outcome.paperQuote.exitQuoteAtMs = 3_612_000;
  const lossRun = paperReplay([first, second], { maxSessionLossSol: 0.01 });
  assert.equal(lossRun.skipped[0].reason, 'SESSION_LOSS_LIMIT');
  const spendRun = paperReplay([rows[0], second], { maxTotalSpendSol: 0.05 });
  assert.equal(spendRun.skipped[0].reason, 'TOTAL_SPEND_LIMIT');
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

test('RugHawk evidence adapter imports only complete point-in-time slot deltas', () => {
  const base = structuredClone(rows[0]);
  base.signal.launchSlotCoverageComplete = false;
  base.signal.launchSlotDeltaPct = null;
  const evidence = { schema: 'positano.launch-evidence.v1', mint: base.signal.mint, scannedAt: 11000,
    sourceEngine: 'RugHawk community fork', creation: { slot: 100, source: { signature: 'synthetic' } },
    coverage: { launchBlock: 'complete', launchBlockDetails: { slot: 100, source: 'getBlock',
      relevantTransactions: 1, inspectedTransactions: 1, reasons: [] } },
    launchSlotObservations: { summedPositiveDeltasPctOfSupply: 4, purchasesVerified: false,
      jitoBundleMembership: 'unverified' } };
  const enriched = attachLaunchEvidence(base, evidence);
  assert.equal(enriched.signal.launchSlotCoverageComplete, true);
  assert.equal(enriched.signal.launchSlotDeltaPct, 4);
  assert.equal(decide(enriched.signal).verdict, 'BUY');
  assert.equal(decide(base.signal).verdict, 'ABSTAIN');
  assert.throws(() => attachLaunchEvidence(base, { ...evidence, scannedAt: 11001 }), /after the decision/);
  const partial = structuredClone(evidence);
  partial.coverage.launchBlock = 'incomplete';
  partial.coverage.launchBlockDetails.reasons = ['sample_limit'];
  assert.equal(attachLaunchEvidence(base, partial).signal.launchSlotDeltaPct, null);
});

test('path simulation exposes adverse latency, failed entry and no fake exits', () => {
  const report = simulateScenarios(rows);
  const [base, stress, failed] = report.scenarios;
  assert.equal(base.results[0].status, 'CLOSED');
  assert.equal(base.results[0].exitReason, 'TAKE_PROFIT');
  assert.ok(base.results[0].netPnlSol > 0);
  assert.equal(stress.results[0].status, 'CLOSED');
  assert.ok(stress.results[0].netPnlSol < 0);
  assert.equal(failed.results[0].status, 'FAILED_ENTRY');
  assert.equal(failed.results[0].netPnlSol, -DEFAULT_SCENARIOS[2].fixedCostsSol);
  const truncated = structuredClone(rows[0]);
  truncated.outcome.pricePath = truncated.outcome.pricePath.slice(0, 1);
  assert.equal(simulatePath(truncated).status, 'UNRESOLVED');
  assert.equal(simulatePath(truncated).netPnlSol, null);
});

test('path simulation rejects reversed ticks and future evidence cannot change policy', () => {
  const reversed = structuredClone(rows[0]);
  reversed.outcome.pricePath[1].atMs = reversed.outcome.pricePath[0].atMs;
  assert.throws(() => simulatePath(reversed), /timestamps must increase/);
  const badCoverage = structuredClone(rows[0]);
  badCoverage.signal.launchSlotCoverageComplete = false;
  badCoverage.signal.launchSlotDeltaPct = null;
  assert.equal(simulatePath(badCoverage).status, 'ABSTAIN');
  const duplicated = simulateScenarios([rows[0], rows[0]]);
  assert.equal(duplicated.scenarios[0].results[1].status, 'DUPLICATE_MINT');
  assert.equal(duplicated.scenarios[0].measuredResults, 1);
  const gap = structuredClone(rows[0]);
  gap.outcome.pricePath = [{ atMs: 11000, priceSol: 0.000001 }, { atMs: 2_000_000, priceSol: 0.000001 }];
  assert.equal(simulatePath(gap).status, 'EXIT_QUOTE_GAP');
  assert.equal(simulatePath(gap).netPnlSol, null);
});

test('official Pump discriminator yields a read-only creation candidate only', () => {
  const sig = 'synthetic-signature';
  const tx = { slot: 100, blockTime: 10, meta: { err: null }, transaction: {
    signatures: [sig], message: { instructions: [{ programId: PUMP_PROGRAM,
      accounts: [rows[0].signal.mint, 'a', 'b', 'c', 'd', rows[1].signal.mint],
      data: '3jQUKbhDQk8du' }] } } };
  const candidate = decodePumpCreation(sig, tx, 11000);
  assert.equal(candidate.mint, rows[0].signal.mint);
  assert.equal(candidate.creationUser, rows[1].signal.mint);
  assert.equal(candidate.instruction, 'create_v2');
  assert.equal(candidate.tradingSignal, false);
  assert.equal(decodePumpCreation(sig, { ...tx, meta: { err: 'failed' } }, 11000), null);
  assert.equal(decodePumpCreation('wrong-signature', tx, 11000), null);
});

test('read-only collector verifies mainnet and decodes a mocked official notification', async () => {
  const signature = 'synthetic-signature';
  const tx = { slot: 100, blockTime: 10, meta: { err: null }, transaction: {
    signatures: [signature], message: { instructions: [{ programId: PUMP_PROGRAM,
      accounts: [rows[0].signal.mint, 'a', 'b', 'c', 'd', rows[1].signal.mint], data: '3jQUKbhDQk8du' }] } } };
  let subscribed;
  class FakeSocket extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    send(data) {
      subscribed = JSON.parse(data);
      queueMicrotask(() => {
        const event = new Event('message');
        Object.defineProperty(event, 'data', { value: JSON.stringify({ method: 'logsNotification',
          params: { result: { context: { slot: 100 },
            value: { err: null, signature, logs: ['Program log: Instruction: CreateV2'] } } } }) });
        this.dispatchEvent(event);
      });
    }
    close() { this.dispatchEvent(new Event('close')); }
  }
  const found = [];
  const stats = await collectPumpCreations({ rpc: { verifyMainnet: async () => {}, call: async () => tx },
    wsUrl: 'wss://example.invalid', socketFactory: () => new FakeSocket(),
    now: () => 11000, maxCandidates: 1, maxDurationMs: 1000, onCandidate: (candidate) => found.push(candidate) });
  assert.equal(subscribed.method, 'logsSubscribe');
  assert.deepEqual(subscribed.params[0].mentions, [PUMP_PROGRAM]);
  assert.equal(found[0].mint, rows[0].signal.mint);
  assert.equal(stats.candidates, 1);
  assert.equal(stats.status, 'candidate_limit');
  assert.throws(() => validateWsUrl('ws://example.com'), /WSS/);
  await assert.rejects(new ReadRpc('https://example.invalid').call('sendTransaction'), /read-only/);
});

test('read RPC accepts only a valid mainnet genesis response', async () => {
  const methods = [];
  const fetcher = async (_url, options) => {
    const request = JSON.parse(options.body);
    methods.push(request.method);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1,
      result: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' }),
    { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await new ReadRpc('https://example.invalid', fetcher).verifyMainnet();
  assert.deepEqual(methods, ['getGenesisHash']);
  const wrong = new ReadRpc('https://example.invalid', async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1,
    result: 'wrong-chain' }), { status: 200 }));
  await assert.rejects(wrong.verifyMainnet(), /not Solana mainnet/);
});

test('finalized launch-slot scan counts positive deltas while exposing coverage', async () => {
  const candidate = { schema: 'positano.pump-creation-candidate.v1', mint: rows[0].signal.mint,
    signature: 'creation-sig', slot: 100 };
  const balance = (accountIndex, raw, owner) => ({ accountIndex, mint: candidate.mint,
    owner, uiTokenAmount: { amount: String(raw), decimals: 6 } });
  const tx = (signature, pre, post) => ({ transaction: { signatures: [signature], accountKeys: [] },
    meta: { err: null, preTokenBalances: pre, postTokenBalances: post } });
  const block = { blockhash: 'synthetic-block', transactions: [
    tx('creation-sig', [], [balance(0, 1000, 'curve')]),
    tx('buyer-sig', [balance(1, 0, 'buyer')], [balance(1, 100, 'buyer')]),
    tx('transfer-sig', [balance(1, 100, 'buyer'), balance(2, 0, 'friend')],
      [balance(1, 50, 'buyer'), balance(2, 50, 'friend')]),
  ] };
  const methods = [];
  const rpc = { verifyMainnet: async () => {}, call: async (method, params) => {
    methods.push(method);
    assert.equal(params[1].commitment, 'finalized');
    return block;
  } };
  const result = await scanLaunchSlot(rpc, candidate, { now: () => 12000 });
  assert.equal(result.coverage.status, 'complete');
  assert.equal(result.creationPositiveRaw, '1000');
  assert.equal(result.summedPositiveRaw, '150');
  assert.equal(result.observations.length, 2);
  assert.deepEqual(methods, ['getBlock']);
  const limited = await scanLaunchSlot(rpc, candidate, { limit: 1 });
  assert.equal(limited.coverage.status, 'incomplete');
  assert.equal(limited.summedPositiveRaw, null);
  assert.ok(limited.coverage.reasons.includes('sample_limit'));
  const missingCreation = { verifyMainnet: async () => {}, call: async () => ({ ...block, transactions: block.transactions.slice(1) }) };
  const missing = await scanLaunchSlot(missingCreation, candidate);
  assert.equal(missing.coverage.status, 'incomplete');
  assert.equal(missing.summedPositiveRaw, null);
  assert.ok(missing.coverage.reasons.includes('creation_missing_from_block'));
});

test('cohort report reconciles scans and refuses false complete coverage', () => {
  const candidate = { schema: 'positano.pump-creation-candidate.v1', mint: rows[0].signal.mint,
    signature: 'creation-sig', slot: 100, observedAtMs: 11000 };
  const scan = { schema: 'positano.launch-slot-scan.v1', mint: candidate.mint,
    creationSignature: candidate.signature, slot: 100, scannedAtMs: 12000,
    coverage: { status: 'complete', relevantTransactions: 0, inspectedTransactions: 0, reasons: [] },
    creationPositiveRaw: '1000', summedPositiveRaw: '0' };
  const report = cohortReport([candidate], [scan]);
  assert.equal(report.counts.complete, 1);
  assert.equal(report.counts.noLaterMintTransactionsObserved, 1);
  assert.match(report.tradingReadiness, /insufficient/);
  assert.throws(() => cohortReport([candidate], [{ ...scan, slot: 101 }]), /does not match/);
  assert.throws(() => cohortReport([candidate], [{ ...scan, coverage: { ...scan.coverage, inspectedTransactions: 1 } }]), /inconsistent coverage/);
});
