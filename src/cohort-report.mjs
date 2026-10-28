import { readFile } from 'node:fs/promises';
import { cohortReport } from './cohort.mjs';

async function jsonl(path) {
  const data = await readFile(path, 'utf8');
  if (data.length > 10_000_000) throw new Error('Input too large');
  const lines = data.split(/\r?\n/).filter(Boolean);
  if (lines.length > 10_000) throw new Error('Too many rows');
  return lines.map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid JSON at line ${index + 1}`); }
  });
}

async function main() {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node src/cohort-report.mjs CREATIONS.jsonl SCANS.jsonl');
  const result = cohortReport(await jsonl(process.argv[2]), await jsonl(process.argv[3]));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
