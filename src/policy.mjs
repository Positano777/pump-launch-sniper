import { createHash } from 'node:crypto';

export const POLICY_VERSION = '0.2.0';
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const DEFAULT_POLICY = Object.freeze({
  maxAgeMs: 15_000,
  maxCreatorPriorLaunches: 20,
  maxCreatorPriorRugs: 2,
  maxTopTenPct: 45,
  maxBundlePct: 25,
  minLiquiditySol: 2,
  maxSpendSol: 0.05,
  maxSlippageBps: 300,
});

function finite(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${name} must be a finite number from ${min} to ${max}`);
  }
  return value;
}

function publicKey(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) return false;
  let n = 0n;
  for (const char of value) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) return false;
    n = n * 58n + BigInt(digit);
  }
  let size = 0;
  while (n > 0n) { size++; n >>= 8n; }
  return value.match(/^1*/)[0].length + size === 32;
}

export function validatePolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('policy must be an object');
  const allowed = Object.keys(DEFAULT_POLICY);
  for (const key of Object.keys(raw)) if (!allowed.includes(key)) throw new TypeError(`unknown policy field: ${key}`);
  return {
    maxAgeMs: finite(raw.maxAgeMs, 'maxAgeMs', 0, 86_400_000),
    maxCreatorPriorLaunches: finite(raw.maxCreatorPriorLaunches, 'maxCreatorPriorLaunches', 0, 1_000_000),
    maxCreatorPriorRugs: finite(raw.maxCreatorPriorRugs, 'maxCreatorPriorRugs', 0, 1_000_000),
    maxTopTenPct: finite(raw.maxTopTenPct, 'maxTopTenPct', 0, 100),
    maxBundlePct: finite(raw.maxBundlePct, 'maxBundlePct', 0, 100),
    minLiquiditySol: finite(raw.minLiquiditySol, 'minLiquiditySol', 0, 1_000_000_000),
    maxSpendSol: finite(raw.maxSpendSol, 'maxSpendSol', Number.MIN_VALUE, 100),
    maxSlippageBps: finite(raw.maxSlippageBps, 'maxSlippageBps', 0, 10_000),
  };
}

export function validateSignal(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('signal must be an object');
  const mint = raw.mint;
  if (!publicKey(mint)) {
    throw new TypeError('mint must be a Solana base58 public key');
  }
  const signal = {
    mint,
    slot: finite(raw.slot, 'slot', 1, Number.MAX_SAFE_INTEGER),
    observedAtMs: finite(raw.observedAtMs, 'observedAtMs', 0, Number.MAX_SAFE_INTEGER),
    launchAtMs: finite(raw.launchAtMs, 'launchAtMs', 0, Number.MAX_SAFE_INTEGER),
    programVerified: raw.programVerified === true,
    quoteSupported: raw.quoteSupported === true,
    evidenceComplete: raw.evidenceComplete === true,
    creatorHistoryComplete: raw.creatorHistoryComplete === true,
    creatorPriorLaunches: finite(raw.creatorPriorLaunches, 'creatorPriorLaunches', 0, 1_000_000),
    creatorPriorRugs: finite(raw.creatorPriorRugs, 'creatorPriorRugs', 0, 1_000_000),
    topTenPct: finite(raw.topTenPct, 'topTenPct', 0, 100),
    bundlePct: finite(raw.bundlePct, 'bundlePct', 0, 100),
    liquiditySol: finite(raw.liquiditySol, 'liquiditySol', 0, 1_000_000_000),
  };
  if (signal.observedAtMs < signal.launchAtMs) throw new TypeError('observation precedes launch');
  if (signal.creatorPriorRugs > signal.creatorPriorLaunches) throw new TypeError('creator rug count exceeds launches');
  return signal;
}

export function decide(rawSignal, policy = DEFAULT_POLICY) {
  const signal = validateSignal(rawSignal);
  policy = validatePolicy(policy);
  const reasons = [];
  let verdict = 'BUY';
  const abstain = (reason) => { reasons.push(reason); verdict = 'ABSTAIN'; };
  const skip = (reason) => { reasons.push(reason); if (verdict !== 'ABSTAIN') verdict = 'SKIP'; };
  if (!signal.programVerified) abstain('PROGRAM_UNVERIFIED');
  if (!signal.quoteSupported) abstain('QUOTE_UNSUPPORTED');
  if (!signal.evidenceComplete) abstain('EVIDENCE_INCOMPLETE');
  if (!signal.creatorHistoryComplete) abstain('CREATOR_HISTORY_INCOMPLETE');
  if (signal.observedAtMs - signal.launchAtMs > policy.maxAgeMs) skip('TOO_OLD');
  if (signal.creatorPriorLaunches > policy.maxCreatorPriorLaunches) skip('CREATOR_LAUNCH_COUNT');
  if (signal.creatorPriorRugs > policy.maxCreatorPriorRugs) skip('CREATOR_RUG_COUNT');
  if (signal.topTenPct > policy.maxTopTenPct) skip('TOP_TEN_CONCENTRATION');
  if (signal.bundlePct > policy.maxBundlePct) skip('LAUNCH_BUNDLE_CONCENTRATION');
  if (signal.liquiditySol < policy.minLiquiditySol) skip('LIQUIDITY_TOO_LOW');
  const fingerprint = createHash('sha256').update(JSON.stringify({ signal, policy, version: POLICY_VERSION })).digest('hex');
  return { mint: signal.mint, slot: signal.slot, verdict, reasons, policyVersion: POLICY_VERSION, fingerprint,
    proposal: verdict === 'BUY' ? { maxSpendSol: policy.maxSpendSol, maxSlippageBps: policy.maxSlippageBps } : null };
}
