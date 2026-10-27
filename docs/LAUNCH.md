# Open-source launch and roadmap

## Why publish this

Pump launch tools often advertise speed or win rate without publishing the launches they missed, the data available at decision time, or the fee assumptions behind results. This project starts with a reproducible decision record: the evidence, policy version, reasons, and a fingerprint. The aim is for contributors to improve the same open measurement framework before anyone claims an edge.

## What the public repository offers today

Version 0.4 is a developer preview. Anyone can clone it, run tests without installing packages, collect read-only Pump creation candidates from a trusted mainnet RPC provider, replay a JSONL cohort, calculate a hypothetical fee-aware 30-minute paper portfolio, stress a supplied price path with exit rules and failed-entry scenarios, compare stage timing from supplied telemetry, import point-in-time launch evidence, and request optional Grok/Muse explanations of public evidence. The repository is MIT licensed. No token purchase, wallet connection, or paid tier is required for the code. A provider may charge for RPC access.

**It does not yet ingest live launches, place orders, or prove a profitable strategy.** The three examples are invented. Do not promote the sample `100%` precision or its positive synthetic PnL as a real result.

## Public milestones

1. **Evidence collector:** expand the shipped read-only creation collector with verified point-in-time creator history, holder and liquidity data, launch-slot activity, gap recovery and reproducible raw references. Bundle membership needs separate corroboration.
2. **Research cohort:** all launches in a predeclared time window, chronological holdout, independently checked 30-minute labels, missing-data accounting, fee and slippage assumptions, and a published failure analysis.
3. **Shadow mode:** live decisions and timing logs without keys or signing. Publish p50/p95/p99 event-to-decision and coverage; compare Photon only with a comparable observed reference.
4. **Live executor:** separate reviewed module using the current official Pump SDK, dedicated low-balance wallet, spend/loss/position caps, idempotency, and kill switch. No default live mode.
5. **Photon adapter:** only if Photon publishes an authorized trading API and its terms permit integration. Otherwise keep Photon as a measured comparison, not a dependency.

Each milestone needs its own test and evidence report. A release label must say precisely which stage was achieved. Contributors can start with [a reproducible evidence issue](../CONTRIBUTING.md).

## Suggested public announcement

> Pump Launch Sniper v0.4 is open source. Its read-only collector found a confirmed Pump creation on public mainnet; its separate simulator explains BUY/SKIP/ABSTAIN and tests delayed or failed entries on synthetic price paths. It does **not** trade live or prove a winning strategy. Help us build complete point-in-time launch evidence and a real cohort before any win-rate or speed claim. Code: https://github.com/Positano777/pump-launch-sniper #Solana #PumpFun #OpenSource
