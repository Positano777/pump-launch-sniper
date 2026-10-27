import { validateSignal } from './policy.mjs';

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function integer(value) { return Number.isSafeInteger(value) && value >= 0; }

/** Convert a RugHawk community-fork export to point-in-time launch-slot evidence only. */
export function attachLaunchEvidence(row, evidence) {
  if (!object(row) || !object(row.signal)) throw new TypeError('row.signal is required');
  const signal = validateSignal(row.signal);
  if (!object(evidence) || evidence.schema !== 'positano.launch-evidence.v1') throw new TypeError('unsupported launch evidence schema');
  if (evidence.mint !== signal.mint) throw new TypeError('evidence mint does not match signal');
  if (!integer(evidence.scannedAt)) throw new TypeError('evidence scannedAt must be an epoch-millisecond integer');
  if (evidence.scannedAt > signal.observedAtMs) throw new TypeError('evidence was scanned after the decision time');
  if (!object(evidence.creation) || evidence.creation.slot !== signal.slot) throw new TypeError('evidence creation slot does not match signal');
  const coverage = evidence.coverage;
  if (!object(coverage) || !['complete', 'incomplete', 'unavailable', 'unknown'].includes(coverage.launchBlock)) {
    throw new TypeError('launch-block coverage is missing or invalid');
  }
  const detail = coverage.launchBlockDetails;
  const observation = evidence.launchSlotObservations;
  let complete = coverage.launchBlock === 'complete' && object(detail) && detail.slot === signal.slot &&
    detail.source === 'getBlock' && integer(detail.relevantTransactions) &&
    integer(detail.inspectedTransactions) && detail.relevantTransactions === detail.inspectedTransactions &&
    Array.isArray(detail.reasons) && detail.reasons.length === 0 && object(observation) &&
    typeof observation.summedPositiveDeltasPctOfSupply === 'number' &&
    Number.isFinite(observation.summedPositiveDeltasPctOfSupply) && observation.summedPositiveDeltasPctOfSupply >= 0;
  // This is an observation, not independently verified buying or bundle membership.
  if (complete && (observation.purchasesVerified !== false || observation.jitoBundleMembership !== 'unverified')) complete = false;
  return {
    ...row,
    signal: { ...row.signal, launchSlotCoverageComplete: complete,
      launchSlotDeltaPct: complete ? observation.summedPositiveDeltasPctOfSupply : null },
    launchEvidenceProvenance: { schema: evidence.schema, sourceEngine: String(evidence.sourceEngine || 'unknown').slice(0, 80),
      scannedAt: evidence.scannedAt, coverage: coverage.launchBlock,
      creationSignature: typeof evidence.creation.source?.signature === 'string' ? evidence.creation.source.signature : null,
      limitations: 'Observed positive token deltas are not verified buys or bundle membership.' },
  };
}
