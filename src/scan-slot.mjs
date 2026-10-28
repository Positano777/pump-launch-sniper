import { readFile } from 'node:fs/promises';
import { ReadRpc } from './rpc-client.mjs';
import { scanLaunchSlot } from './launch-slot.mjs';

async function main() {
  const path = process.argv[2], rpcUrl = process.env.SOLANA_RPC_URL;
  if (!path || !rpcUrl) throw new Error('Usage: set SOLANA_RPC_URL, then node src/scan-slot.mjs CANDIDATE.json');
  const data = await readFile(path, 'utf8');
  if (data.length > 100_000) throw new Error('Candidate file too large');
  const candidate = JSON.parse(data);
  const result = await scanLaunchSlot(new ReadRpc(rpcUrl), candidate);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
