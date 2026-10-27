import { decodePumpCreation, PUMP_PROGRAM } from './pump-tx.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function validateWsUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('invalid WebSocket URL'); }
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new TypeError('WebSocket requires WSS or local loopback WS');
  }
  if (url.username || url.password || url.hash) throw new TypeError('WebSocket URL cannot contain basic auth or a fragment');
  return url;
}

/** Bounded read-only collector. No signer, order builder or sendTransaction path exists. */
export async function collectPumpCreations({ rpc, wsUrl, onCandidate, onStatus = () => {},
  socketFactory = (url) => new WebSocket(url), now = Date.now,
  maxCandidates = 5, maxDurationMs = 60_000, maxQueue = 20 } = {}) {
  if (!rpc || typeof rpc.call !== 'function' || typeof rpc.verifyMainnet !== 'function') throw new TypeError('read RPC required');
  if (typeof onCandidate !== 'function') throw new TypeError('onCandidate callback required');
  if (![maxCandidates, maxDurationMs, maxQueue].every((x) => Number.isSafeInteger(x) && x > 0)) throw new TypeError('collector limits must be positive integers');
  if (maxCandidates > 100 || maxDurationMs > 3_600_000 || maxQueue > 100) throw new TypeError('collector limits exceeded');
  const endpoint = validateWsUrl(wsUrl);
  await rpc.verifyMainnet();
  const socket = socketFactory(endpoint);
  const seen = new Set();
  const stats = { notifications: 0, createHints: 0, candidates: 0, fetchMisses: 0,
    decodeMisses: 0, malformedNotifications: 0, queueDrops: 0, duplicates: 0, status: 'running' };
  let stopped = false, pending = 0, chain = Promise.resolve(), timer;
  return new Promise((resolve, reject) => {
    function finish(status, error) {
      if (stopped) return;
      stopped = true;
      stats.status = status;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      chain.then(() => error ? reject(error) : resolve(stats), reject);
    }
    timer = setTimeout(() => finish('duration_limit'), maxDurationMs);
    socket.addEventListener('open', () => {
      if (stopped) return;
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'logsSubscribe',
        params: [{ mentions: [PUMP_PROGRAM] }, { commitment: 'confirmed' }] }));
    });
    socket.addEventListener('error', () => finish('socket_error', new Error('WebSocket unavailable')));
    socket.addEventListener('close', () => {
      if (!stopped) { onStatus({ kind: 'coverage_gap', reason: 'socket_closed' }); finish('socket_closed'); }
    });
    socket.addEventListener('message', (event) => {
      if (stopped || typeof event.data !== 'string' || event.data.length > 2_000_000) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.id === 1 && message.error) { finish('subscription_rejected', new Error('RPC rejected logsSubscribe')); return; }
      if (message.method !== 'logsNotification') return;
      stats.notifications++;
      const result = message.params?.result;
      const value = result?.value;
      const notifiedSlot = result?.context?.slot;
      if (!Number.isSafeInteger(notifiedSlot) || notifiedSlot < 0) {
        stats.malformedNotifications++;
        return;
      }
      if (!value || value.err !== null || typeof value.signature !== 'string') return;
      if (!Array.isArray(value.logs)) { stats.malformedNotifications++; return; }
      if (!value.logs.some((line) => typeof line === 'string' && /Instruction: Create(?:V2)?\b/.test(line))) return;
      stats.createHints++;
      if (seen.has(value.signature)) { stats.duplicates++; return; }
      seen.add(value.signature);
      if (seen.size > 10_000) seen.delete(seen.values().next().value);
      if (pending >= maxQueue) {
        stats.queueDrops++;
        onStatus({ kind: 'coverage_gap', reason: 'queue_overflow', signature: value.signature });
        return;
      }
      pending++;
      const observedAtMs = now();
      chain = chain.then(async () => {
        if (stopped) return;
        let tx = null;
        for (const wait of [0, 250, 750]) {
          if (wait) await pause(wait);
          if (stopped) return;
          try { tx = await rpc.call('getTransaction', [value.signature,
            { commitment: 'confirmed', encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]); }
          catch { /* retry a bounded number of times */ }
          if (tx) break;
        }
        if (!tx) {
          stats.fetchMisses++;
          onStatus({ kind: 'coverage_gap', reason: 'transaction_unavailable', signature: value.signature });
          return;
        }
        if (tx.slot !== notifiedSlot) {
          stats.decodeMisses++;
          onStatus({ kind: 'coverage_gap', reason: 'slot_mismatch', signature: value.signature });
          return;
        }
        const candidate = decodePumpCreation(value.signature, tx, observedAtMs);
        if (!candidate) {
          stats.decodeMisses++;
          onStatus({ kind: 'coverage_gap', reason: 'create_hint_unverified', signature: value.signature });
          return;
        }
        await onCandidate(candidate);
        stats.candidates++;
        if (stats.candidates >= maxCandidates) finish('candidate_limit');
      }).catch((error) => finish('collector_error', error)).finally(() => { pending--; });
    });
  });
}
