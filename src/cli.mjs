import { readFile } from 'node:fs/promises';
import { replay } from './replay.mjs';
import { paperReplay } from './paper.mjs';
import { latencyReport } from './latency.mjs';
import { attachLaunchEvidence } from './evidence.mjs';
import { simulateScenarios } from './path-sim.mjs';
import { analyzeWithModel } from './models.mjs';

async function main(args) {
  const [command, path, provider] = args;
  if (!['replay', 'paper', 'latency', 'simulate', 'analyze', 'enrich'].includes(command) || !path || (command === 'analyze' && !['grok', 'muse'].includes(provider)) || (command === 'enrich' && !provider)) {
    throw new Error('Usage: node src/cli.mjs replay|paper|latency|simulate FILE.jsonl | analyze FILE.jsonl grok|muse | enrich ROW.jsonl EVIDENCE.json');
  }
  const data = await readFile(path, 'utf8');
  if (data.length > 10_000_000) throw new Error('Input too large');
  const rows = data.split(/\r?\n/).filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid JSON at line ${i + 1}`); }
  });
  if (command === 'replay') return replay(rows);
  if (command === 'paper') return paperReplay(rows);
  if (command === 'latency') return latencyReport(rows);
  if (command === 'simulate') return simulateScenarios(rows);
  if (command === 'enrich') {
    if (rows.length !== 1) throw new Error('Enrich accepts exactly one row');
    return attachLaunchEvidence(rows[0], JSON.parse(await readFile(provider, 'utf8')));
  }
  if (rows.length !== 1) throw new Error('Analyze accepts exactly one record');
  return analyzeWithModel(provider, rows[0].signal);
}

main(process.argv.slice(2)).then((result) => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
