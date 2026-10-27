// Program address and instruction discriminators from pump-fun/pump-public-docs/idl/pump.json.
export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const CREATE_V2 = [214, 144, 76, 236, 95, 139, 49, 180];
const CREATE_LEGACY = [24, 30, 200, 40, 5, 28, 7, 119];
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decode58(text) {
  if (typeof text !== 'string' || text.length > 2048) return null;
  let n = 0n;
  for (const char of text) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) return null;
    n = n * 58n + BigInt(digit);
  }
  const out = [];
  while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  const zeros = text.match(/^1*/)?.[0].length ?? 0;
  return Uint8Array.from([...Array(zeros).fill(0), ...out]);
}

function prefix(bytes, expected) {
  return bytes && bytes.length >= 8 && expected.every((byte, i) => bytes[i] === byte);
}

/** Return a conservative creation candidate, not a trading signal. */
export function decodePumpCreation(signature, transaction, observedAtMs) {
  if (typeof signature !== 'string' || !Array.isArray(transaction?.transaction?.signatures) ||
      !transaction.transaction.signatures.includes(signature)) return null;
  if (transaction.meta?.err !== null || !Number.isSafeInteger(transaction.slot)) return null;
  const instructions = transaction.transaction.message?.instructions;
  if (!Array.isArray(instructions)) return null;
  for (const instruction of instructions) {
    if (instruction?.programId !== PUMP_PROGRAM || !Array.isArray(instruction.accounts)) continue;
    const data = decode58(instruction.data);
    const kind = prefix(data, CREATE_V2) ? 'create_v2' : prefix(data, CREATE_LEGACY) ? 'create' : null;
    if (!kind) continue;
    const mint = instruction.accounts[0];
    const creationUser = instruction.accounts[kind === 'create_v2' ? 5 : 7];
    if (typeof mint !== 'string' || typeof creationUser !== 'string') continue;
    return { schema: 'positano.pump-creation-candidate.v1', signature, mint, creationUser,
      slot: transaction.slot, instruction: kind,
      blockTimeMs: Number.isSafeInteger(transaction.blockTime) ? transaction.blockTime * 1000 : null,
      observedAtMs, source: 'Solana getTransaction jsonParsed confirmed',
      coverage: 'one confirmed transaction; no launch-slot, holder, creator-history or price coverage',
      tradingSignal: false };
  }
  return null;
}
