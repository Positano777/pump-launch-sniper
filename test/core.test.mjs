import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decide } from '../src/policy.mjs';
import { replay } from '../src/replay.mjs';
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
});
