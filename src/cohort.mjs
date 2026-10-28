export function cohortReport(candidates, scans) {
  if (!Array.isArray(candidates) || !Array.isArray(scans)) throw new TypeError('candidates and scans must be arrays');
  const byMint = new Map(), byScan = new Map();
  for (const candidate of candidates) {
    if (candidate?.schema !== 'positano.pump-creation-candidate.v1' || typeof candidate.mint !== 'string' ||
        typeof candidate.signature !== 'string' || !Number.isSafeInteger(candidate.slot) || candidate.slot < 1 ||
        !Number.isSafeInteger(candidate.observedAtMs) || candidate.observedAtMs < 0) throw new TypeError('invalid creation candidate');
    if (byMint.has(candidate.mint)) throw new TypeError('duplicate mint in cohort');
    byMint.set(candidate.mint, candidate);
  }
  for (const scan of scans) {
    if (scan?.schema !== 'positano.launch-slot-scan.v1' || typeof scan.mint !== 'string' ||
        !Number.isSafeInteger(scan.scannedAtMs) || scan.scannedAtMs < 0 ||
        !['complete', 'incomplete', 'unavailable'].includes(scan.coverage?.status)) {
      throw new TypeError('invalid launch-slot scan');
    }
    if (scan.coverage.status === 'complete' &&
        (!Number.isSafeInteger(scan.coverage.relevantTransactions) || scan.coverage.relevantTransactions < 0 ||
        scan.coverage.inspectedTransactions !== scan.coverage.relevantTransactions ||
        !Array.isArray(scan.coverage.reasons) || scan.coverage.reasons.length)) {
      throw new TypeError('complete scan has inconsistent coverage');
    }
    if (byScan.has(scan.mint)) throw new TypeError('duplicate scan for mint');
    const candidate = byMint.get(scan.mint);
    if (!candidate || scan.slot !== candidate.slot || scan.creationSignature !== candidate.signature) {
      throw new TypeError('scan does not match a cohort creation');
    }
    if (scan.scannedAtMs < candidate.observedAtMs) throw new TypeError('scan timestamp precedes candidate');
    byScan.set(scan.mint, scan);
  }
  const counts = { candidates: candidates.length, scans: byScan.size, complete: 0, incomplete: 0,
    unavailable: 0, missing: 0, withLaterMintTransactions: 0, noLaterMintTransactionsObserved: 0 };
  const rows = candidates.map((candidate) => {
    const scan = byScan.get(candidate.mint);
    if (!scan) counts.missing++;
    else {
      counts[scan.coverage.status]++;
      if (scan.coverage.status === 'complete') {
        if (scan.coverage.relevantTransactions > 0) counts.withLaterMintTransactions++;
        else counts.noLaterMintTransactionsObserved++;
      }
    }
    return { mint: candidate.mint, slot: candidate.slot, creationSignature: candidate.signature,
      candidateObservedAtMs: candidate.observedAtMs, scanObservedAtMs: scan?.scannedAtMs ?? null,
      scanCoverage: scan?.coverage.status ?? 'missing',
      laterMintTransactions: scan?.coverage.relevantTransactions ?? null,
      creationPositiveRaw: scan?.creationPositiveRaw ?? null,
      laterPositiveRaw: scan?.summedPositiveRaw ?? null };
  });
  return { schema: 'positano.pump-cohort-report.v1', counts, rows,
    tradingReadiness: 'insufficient: no complete point-in-time signal or validated price path',
    caveats: ['A bounded, first-N collection window is a convenience sample, not a representative launch cohort.',
      'A complete getBlock response is provider coverage only. Later scans cannot be used as launch-time knowledge.',
      'Creation and later positive deltas can include reserves, transfers and repeated circulation; raw amounts across coins are not comparable.',
      'No price, realized PnL, quote asset, holder safety, verified buy classification or Jito bundle membership is established.'] };
}
