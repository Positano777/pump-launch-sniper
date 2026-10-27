# Simulation check: synthetic fixture only

Reproduced on 2026-10-26 with Node 22+:

```sh
npm test
npm run simulate
```

The input is [three invented launches](../examples/launches.synthetic.jsonl); only one passes the illustrative decision policy. Its price path and every fee assumption are invented. The complete machine-readable output is [simulation.synthetic.json](simulation.synthetic.json).

| Scenario | Entry/exit result for the one accepted launch | Hypothetical net SOL |
|---|---|---:|
| Base: immediate entry, 50 bps entry/exit slippage | Take profit | +0.03247456 |
| Stress: delayed entry, 300 bps entry/exit slippage | Trailing stop | -0.01226063 |
| Failed entry: no fill; fixed attempt cost | Failed entry | -0.00000500 |

The same invented path changes from a gain to a loss under slower, more expensive entry. This is a **logic check**, not evidence of real profitability or true failure rates. Sparse ticks can miss intra-tick moves. The simulator returns `UNRESOLVED` or `EXIT_QUOTE_GAP` instead of inventing an exit when path coverage is missing. It does not model priority auction, market impact, partial fills, network landing, or a real Photon comparison.

The launch-slot evidence adapter has a separate test: a complete same-slot export can fill `launchSlotDeltaPct`; a late or incomplete export cannot be used for an earlier decision. Those deltas do not prove Jito bundle membership. Seventeen local tests cover these gates, fees, cash and session limits, exits, missing data and the read-only collector. The collector tests use mocked RPC/WebSocket traffic; they do not establish real network coverage.
