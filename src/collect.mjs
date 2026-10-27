import { ReadRpc } from './rpc-client.mjs';
import { collectPumpCreations } from './collector.mjs';

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} needs a positive integer`);
  return value;
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL, wsUrl = process.env.SOLANA_WS_URL;
  if (!rpcUrl || !wsUrl) throw new Error('Set SOLANA_RPC_URL and SOLANA_WS_URL for the same trusted mainnet provider');
  const seconds = option(process.argv, '--seconds', 60);
  const maxCandidates = option(process.argv, '--max', 5);
  const rpc = new ReadRpc(rpcUrl);
  const stats = await collectPumpCreations({ rpc, wsUrl, maxCandidates, maxDurationMs: seconds * 1000,
    onCandidate: (candidate) => { process.stdout.write(`${JSON.stringify(candidate)}\n`); },
    onStatus: (status) => { process.stderr.write(`${JSON.stringify(status)}\n`); } });
  process.stderr.write(`${JSON.stringify({ kind: 'collector_end', ...stats })}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
