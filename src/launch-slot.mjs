function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keyOf(tx) { return tx?.transaction?.signatures?.[0]; }
function amount(balance) {
  const raw = balance?.uiTokenAmount?.amount;
  if (typeof raw !== 'string' || !/^\d{1,40}$/.test(raw)) throw new TypeError('token balance amount unavailable');
  return BigInt(raw);
}
function balancesFor(meta, mint, side) {
  const input = meta?.[side];
  if (!Array.isArray(input)) throw new TypeError('token balance metadata unavailable');
  const result = new Map();
  for (const balance of input) {
    if (balance?.mint !== mint) continue;
    if (!Number.isSafeInteger(balance.accountIndex) || balance.accountIndex < 0 || result.has(balance.accountIndex)) {
      throw new TypeError('token balance account index unavailable or duplicated');
    }
    result.set(balance.accountIndex, { raw: amount(balance), owner: typeof balance.owner === 'string' ? balance.owner : null });
  }
  return result;
}
function positiveDeltas(meta, mint) {
  const pre = balancesFor(meta, mint, 'preTokenBalances');
  const post = balancesFor(meta, mint, 'postTokenBalances');
  const gains = [];
  let sum = 0n, missingOwner = false;
  for (const [accountIndex, after] of post) {
    const before = pre.get(accountIndex)?.raw ?? 0n;
    const delta = after.raw - before;
    if (delta <= 0n) continue;
    sum += delta;
    gains.push({ accountIndex, owner: after.owner, positiveDeltaRaw: delta.toString() });
    if (!after.owner) missingOwner = true;
  }
  return { gains, sum, missingOwner };
}

/** Finalized exact-slot observation for research, not a bundle or buy detector. */
export async function scanLaunchSlot(rpc, candidate, { limit = 100, now = Date.now } = {}) {
  if (!rpc || typeof rpc.call !== 'function' || typeof rpc.verifyMainnet !== 'function') throw new TypeError('read RPC required');
  if (!record(candidate) || candidate.schema !== 'positano.pump-creation-candidate.v1' ||
      typeof candidate.mint !== 'string' || typeof candidate.signature !== 'string' ||
      !Number.isSafeInteger(candidate.slot) || candidate.slot < 1) throw new TypeError('creation candidate required');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('limit must be 1..1000');
  await rpc.verifyMainnet();
  const reasons = [];
  let block;
  try {
    block = await rpc.call('getBlock', [candidate.slot, { commitment: 'finalized', encoding: 'jsonParsed',
      transactionDetails: 'accounts', maxSupportedTransactionVersion: 1, rewards: false }]);
  } catch { reasons.push('block_fetch_failed'); }
  const base = { schema: 'positano.launch-slot-scan.v1', mint: candidate.mint, creationSignature: candidate.signature,
    slot: candidate.slot, scannedAtMs: now(), source: 'Solana getBlock finalized accounts',
    interpretation: 'Creation-transaction positive deltas are separate and can include reserve allocations; they do not establish mint supply. Later same-slot positive deltas can include transfers and repeated circulation. Neither proves buys, coordination or Jito bundles.' };
  if (!record(block) || !Array.isArray(block.transactions)) {
    return { ...base, coverage: { status: 'unavailable', reasons: reasons.length ? reasons : ['block_unavailable'],
      relevantTransactions: null, inspectedTransactions: 0 },
      creationTransactionIndex: null, creationPositiveDeltas: null, creationPositiveRaw: null,
      observations: [], summedPositiveRaw: null };
  }
  const transactions = block.transactions;
  const creationIndex = transactions.findIndex((tx) => tx?.transaction?.signatures?.includes(candidate.signature));
  if (creationIndex < 0) reasons.push('creation_missing_from_block');
  if (transactions.some((tx) => !record(tx.meta))) reasons.push('transaction_metadata_missing');
  let creationPositiveDeltas = null, creationPositiveRaw = null;
  if (creationIndex >= 0) {
    try {
      const creation = positiveDeltas(transactions[creationIndex].meta, candidate.mint);
      creationPositiveDeltas = creation.gains;
      creationPositiveRaw = creation.sum.toString();
      if (creation.missingOwner) reasons.push('owner_missing');
    } catch { reasons.push('creation_token_balance_metadata_missing'); }
  }
  const relevant = [];
  for (let index = Math.max(0, creationIndex + 1); index < transactions.length; index++) {
    const tx = transactions[index];
    if (tx?.meta?.err !== null) continue;
    const pre = tx.meta?.preTokenBalances, post = tx.meta?.postTokenBalances;
    const touchedMint = [...(Array.isArray(pre) ? pre : []), ...(Array.isArray(post) ? post : [])]
      .some((balance) => balance?.mint === candidate.mint);
    const mentionedMint = tx.transaction?.accountKeys?.some((key) => (typeof key === 'string' ? key : key?.pubkey) === candidate.mint);
    if (touchedMint || mentionedMint) relevant.push({ tx, index });
  }
  if (relevant.length > limit) reasons.push('sample_limit');
  const observations = [];
  let sum = 0n;
  for (const { tx, index } of relevant.slice(0, limit)) {
    try {
      const delta = positiveDeltas(tx.meta, candidate.mint);
      sum += delta.sum;
      if (delta.missingOwner) reasons.push('owner_missing');
      observations.push({ signature: keyOf(tx) ?? null, transactionIndex: index, positiveDeltas: delta.gains });
    } catch {
      reasons.push('token_balance_metadata_missing');
    }
  }
  const uniqueReasons = [...new Set(reasons)];
  return { ...base, blockhash: typeof block.blockhash === 'string' ? block.blockhash : null,
    creationTransactionIndex: creationIndex,
    creationPositiveDeltas, creationPositiveRaw,
    coverage: { status: uniqueReasons.length ? 'incomplete' : 'complete', reasons: uniqueReasons,
      relevantTransactions: relevant.length, inspectedTransactions: Math.min(relevant.length, limit) },
    observations, summedPositiveRaw: uniqueReasons.length ? null : sum.toString() };
}
