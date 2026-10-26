# Open-source launch and roadmap

## Why publish this

Pump launch tools often advertise speed or win rate without publishing the launches they missed, the data available at decision time, or the fee assumptions behind results. This project starts with a reproducible decision record: the evidence, policy version, reasons, and a fingerprint. The aim is for contributors to improve the same open measurement framework before anyone claims an edge.

## What the public repository offers today

Version 0.2 is a developer preview. Anyone can clone it, run tests without installing packages, replay a JSONL cohort, calculate a hypothetical fee-aware 30-minute paper portfolio, compare stage timing from supplied telemetry, and request optional Grok/Muse explanations of public evidence. The repository is MIT licensed. No token purchase, wallet connection, or paid tier is required for the code.

**It does not yet ingest live launches, place orders, or prove a profitable strategy.** The three examples are invented. Do not promote the sample `100%` precision or its positive synthetic PnL as a real result.

## Public milestones

1. **Evidence collector:** authorized Solana RPC/WebSocket source, verified Pump program and mint, timestamped point-in-time creator and bundle fields, gap detection, and reproducible raw references.
2. **Research cohort:** all launches in a predeclared time window, chronological holdout, independently checked 30-minute labels, missing-data accounting, fee and slippage assumptions, and a published failure analysis.
3. **Shadow mode:** live decisions and timing logs without keys or signing. Publish p50/p95/p99 event-to-decision and coverage; compare Photon only with a comparable observed reference.
4. **Live executor:** separate reviewed module using the current official Pump SDK, dedicated low-balance wallet, spend/loss/position caps, idempotency, and kill switch. No default live mode.
5. **Photon adapter:** only if Photon publishes an authorized trading API and its terms permit integration. Otherwise keep Photon as a measured comparison, not a dependency.

Each milestone needs its own test and evidence report. A release label must say precisely which stage was achieved. Contributors can start with [a reproducible evidence issue](../CONTRIBUTING.md).

## Suggested public announcement

> We just open-sourced Pump Launch Sniper, an experiment in transparent launch decisions. The first release replays launch evidence, explains every BUY/SKIP/ABSTAIN, simulates 30-minute trades with fees and slippage, and reports latency from supplied timestamps. It does **not** trade live yet, and our sample is synthetic. We want contributors to help build a real, reproducible launch cohort before any speed or win-rate claim. Code: https://github.com/Positano777/pump-launch-sniper #Solana #PumpFun #OpenSource
