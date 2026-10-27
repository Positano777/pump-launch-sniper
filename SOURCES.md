# Reuse and source review

Reviewed on 2026-10-26. This repository does **not** execute cloned bots or include third-party packages. Ideas and documented data formats are integrated through original code. License status can change; inspect the exact upstream revision before copying any code.

| Source | Verified role | Integration here |
|---|---|---|
| [Positano777/pumpfun-community-tools](https://github.com/Positano777/pumpfun-community-tools), our MIT RugHawk fork | Creation-slot evidence export with explicit `getBlock` coverage and observed token deltas | `src/evidence.mjs` accepts `positano.launch-evidence.v1` and rejects late, mismatched or incomplete evidence. No upstream code copied. |
| [bobvasic/rughawk](https://github.com/bobvasic/rughawk), MIT | Original launch-block analysis behind our fork | Attribution for the evidence model. Same-slot deltas are not called verified bundles. |
| [nirholas/solana-sniper-mcp](https://github.com/nirholas/solana-sniper-mcp), Apache-2.0 at review | Pluggable feed/store/executor design; simulation mode, stop loss, take profit, trailing exit, time limit, daily budget | Original path simulator and paper risk caps inspired by those patterns. No package, wallet adapter or source files imported. Its `snipe_now` bypasses scoring; this project does not offer that bypass. |
| [Kelows/million](https://github.com/Kelows/million), MIT at review | Self-hosted wallet tracking and paper-first copy trading | Product comparison only. Its Helius feed and runtime were not installed or executed. |
| [pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs) | Official current Pump program ID, creation discriminators, instruction accounts and trade documentation | `src/pump-tx.mjs` validates confirmed top-level creation instructions against the IDL. Reference for a future trade builder; no live executor. |
| [Solana RPC documentation](https://solana.com/docs/rpc/websocket/logssubscribe) | Official `logsSubscribe` and `getTransaction` request/response contracts | Read-only, bounded WebSocket collector and HTTP client. |
| [nirholas/pumpkit](https://github.com/nirholas/pumpkit) and related repos | Product references; current license review found reuse restrictions | No fork or code reuse. |

## Limits of the evidence integration

The RugHawk-family export reports **summed positive token deltas** among relevant launch-slot transactions. Transfers or repeated circulation can inflate this sum. It does not establish purchases, coordinated wallets or Jito bundle membership. `getBlock` completeness describes the provider response, not independent consensus verification. The scanner may run after the launch; using such a late result to backtest a hypothetical immediate buy would leak future information. `attachLaunchEvidence` therefore refuses scans with `scannedAt > signal.observedAtMs`.

The path simulator uses user-supplied ticks and cost scenarios. It cannot reproduce a live venue's fill or priority auction from source code alone.
