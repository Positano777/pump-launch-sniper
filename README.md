# Pump Launch Sniper

An independent, MIT-licensed research prototype by [Positano777](https://github.com/Positano777). It replays Pump launch signals, makes deterministic `BUY` / `SKIP` / `ABSTAIN` decisions, and reports error and local decision-time metrics. Optional Grok and Muse adapters produce **research commentary only**. This release does not connect to Photon, monitor live launches, sign, or submit transactions.

**Status: prototype. The thresholds are illustrative, not an investment strategy.** There is no measured profitability, landing probability, or Photon-comparable latency. The included dataset is synthetic. Do not fund the example addresses.

## Run offline

Requires Node 22 or later; no package installation or post-install scripts.

```sh
npm test
npm run replay
node src/cli.mjs replay examples/launches.synthetic.jsonl
```

The replay input is newline-delimited JSON. Each row has a `signal` containing only information available at decision time. An optional `outcome.favorableAt30m` boolean is read only by the reporter. The program does not infer that label, verify market prices, or calculate PnL. The report excludes abstentions from precision/recall denominators and identifies duplicates by mint.

## Optional Grok or Muse analysis

Set `XAI_API_KEY` for Grok or `MODEL_API_KEY` for Muse in your environment. The tool does **not** load `.env` files. Pass a file with exactly one record:

```sh
node src/cli.mjs analyze one-launch.jsonl grok
node src/cli.mjs analyze one-launch.jsonl muse
```

The adapter sends the public signal to the chosen provider. Never include secrets or private wallet data in a signal. Model text cannot change a policy result. This is a hosted API integration, not a fork of either model. Muse Spark Open weights are available separately under Meta's Muse Model License; they are too large to assume local hosting for this prototype.

## Toward an independently useful sniper

```mermaid
flowchart LR
  F[Authorized Solana event feed] --> E[Validated launch evidence]
  E --> C[Versioned deterministic policy]
  C --> P[Replay and paper trader: current release]
  E --> A[Grok or Muse research: optional]
  A --> R[Feature proposals for offline testing]
  C -. future, separately reviewed .-> X[Bounded live executor using official Pump SDK]
  X -. optional if documented and authorized .-> H[Photon adapter]
```

Next requirements before live execution: a licensed launch event feed, point-in-time creator and bundle evidence, a large chronological labeled cohort, realistic fill/slippage simulation, fee-aware PnL, spend and loss caps, a dedicated low-balance wallet, a kill switch, and review of the current Pump SDK instructions. Benchmark event availability, decision, submission, and confirmation separately. Photon describes its submission method as proprietary; no documented Photon trading API has been verified. Do not automate its website or undocumented endpoints.

## Sources

- [Pump official trade instructions](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/TRADE_V3.md)
- [xAI model API](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions)
- [Meta Model API](https://dev.meta.ai/docs/api-reference)
- [Muse Spark Open](https://dev.meta.ai/docs/muse-spark-open)
- [Photon FAQ](https://pies-organization.gitbook.io/photon-trading/photon-on-sol/faq)

Not affiliated with Pump, Photon, xAI, Meta, or Solana.
