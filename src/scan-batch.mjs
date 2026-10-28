import { readFile } from 'node:fs/promises';
import { ReadRpc } from './rpc-client.mjs';
import { scanLaunchSlot } from './launch-slot.mjs';

async function main() {
  const path = process.argv[2], rpcUrl = process.env.SOLANA_RPC_URL;
  if (!path || !rpcUrl) throw new Error('Usage: set SOLANA_RPC_URL, then node src/scan-batch.mjs CREATIONS.jsonl');
  const data = await readFile(path, 'utf8');
  if (data.length > 5_000_000) throw new Error('Candidate file too large');
  const lines = data.split(/\r?\n/).filter(Boolean);
  if (!lines.length || lines.length > 100) throw new Error('Batch requires 1..100 candidates');
  const rpc = new ReadRpc(rpcUrl);
  await rpc.verifyMainnet();
  const readRpc = { call: (method, params) => rpc.call(method, params), verifyMainnet: async () => {} };
  const seen = new Set();
  const counts = { total: 0, complete: 0, incomplete: 0, unavailable: 0, duplicates: 0 };
  for (const [index, line] of lines.entries()) {
    let candidate;
    try { candidate = JSON.parse(line); } catch { throw new Error(`Invalid JSON at line ${index + 1}`); }
    if (seen.has(candidate.signature)) { counts.duplicates++; continue; }
    seen.add(candidate.signature);
    const result = await scanLaunchSlot(readRpc, candidate);
    counts.total++;
    counts[result.coverage.status]++;
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
  process.stderr.write(`${JSON.stringify({ kind: 'batch_end', ...counts })}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
