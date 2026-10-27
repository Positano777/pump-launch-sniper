# Public mainnet collector smoke test — 2026-10-27

The read-only collector ran against `api.mainnet-beta.solana.com` with a 20-second limit and a one-candidate limit. It stopped at the first decoded confirmed Pump creation after roughly 6.5 seconds of process time. No wallet, private key, signer, third-party bot or trade was involved.

| Observation | Value |
|---|---|
| Instruction | `create_v2` |
| Slot | `461870008` |
| Mint | `48dnQpC1gE1ovAu3Bh7KSxeKhf4daBhLXs2bmgPspump` |
| `user` account from instruction | `GK87eYi4ghyLA6CPWSJjP1CAMnhvk7JMAQ7BJLhWiowe` |
| [Confirmed transaction](https://solscan.io/tx/5kisRUpxcdTRLpU1r77PXvNTxYcYxHxu4zpoADscbdhpz3cxnyFPhtgXuPo9D25MrmWMe4BhKcKbRFxw6keFCYau) | `5kisRUpxcdTRLpU1r77PXvNTxYcYxHxu4zpoADscbdhpz3cxnyFPhtgXuPo9D25MrmWMe4BhKcKbRFxw6keFCYau` |
| Provider block time | `2026-10-27T00:37:55.000Z` (second-resolution estimate) |
| Local observation time | `2026-10-27T00:37:59.036Z` |
| Pump-related log notifications | `653` |
| Creation log hints / decoded candidates | `1 / 1` |
| Fetch misses / decode misses / malformed / queue drops | `0 / 0 / 0 / 0` |
| Stop reason | `candidate_limit` |

These are observations from one provider and a short, bounded run. The `user` account is taken from the official creation instruction; it is not independently established as the economic creator or fee recipient. The four-second difference between block time and local observation is **not** a transaction inclusion or Photon-comparable latency measurement: block time has second resolution, provider delivery and confirmation delays are mixed, and no reference cohort was measured. Zero reported gaps does not prove complete coverage. The candidate has no verified quote asset, launch-slot buyer set, holders, creator history, liquidity, price, or bundle membership. It is **not a trading signal**.

The command used was `node src/collect.mjs --seconds 20 --max 1` with public mainnet HTTP and WebSocket URLs supplied through environment variables. See [collector setup and limits](COLLECTOR.md).
