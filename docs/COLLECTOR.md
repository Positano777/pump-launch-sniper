# Read-only Pump creation collector

This collector listens for confirmed Solana log notifications mentioning the official Pump program, treats `Instruction: Create` or `CreateV2` as **hints**, and fetches each hinted transaction through `getTransaction`. It accepts a creation only when the confirmed transaction succeeded, the signature matches, a top-level instruction calls the official Pump program, and the instruction discriminator matches the official IDL. It then emits a public mint, the instruction's `user` account, slot, signature and timestamps as JSONL. That account is not automatically verified as the economic creator or fee recipient.

It **does not** turn a creation into a `BUY` signal. It has no wallet, signer, transaction builder, or broadcasting RPC method. No third-party bot code runs. Only `getGenesisHash`, `getTransaction` and `getBlock` are allowed through its HTTP RPC client.

## Run against your own trusted RPC provider

Node 22.18+ includes the WebSocket API used here. Use a mainnet provider with HTTPS RPC and WSS endpoints. Put URLs in environment variables; credential-bearing URLs are never printed by this tool. On PowerShell:

```powershell
$env:SOLANA_RPC_URL = 'https://YOUR_PROVIDER_RPC'
$env:SOLANA_WS_URL = 'wss://YOUR_PROVIDER_WS'
node src/collect.mjs --seconds 60 --max 5 > creations.jsonl
```

`stdout` contains confirmed creation candidates only. `stderr` contains coverage-gap and end-status JSON. Review both. The process is bounded to at most one hour and 100 candidates per invocation; the example stops after 60 seconds or five candidates. RPC URLs using plain HTTP/WS are allowed only for local loopback tests. Do not commit provider URLs or any private keys.

## Finalized launch-slot research scan

After a candidate's block is finalized, inspect public token-account changes in its creation slot. This is **forensic research after launch**, not a fast-path trading input:

```powershell
$env:SOLANA_RPC_URL = 'https://YOUR_PROVIDER_RPC'
node src/scan-slot.mjs examples/creation.mainnet.json
node src/scan-batch.mjs examples/creations.mainnet.sample.jsonl > scans.jsonl
node src/cohort-report.mjs examples/creations.mainnet.sample.jsonl scans.jsonl
```

The scanner fetches `getBlock` in `finalized` `jsonParsed` accounts mode, records the creation transaction separately, and sums positive raw token-account deltas in later relevant transactions. It checks the block response for missing metadata and sampling limits, then reports `complete`, `incomplete` or `unavailable` provider coverage. Raw deltas are **not** distinct holdings, verified buys, Jito bundles, or a supply percentage; transfers and repeated circulation can inflate them. The 20 MB bounded response and 30-second timeout can yield `unavailable` on large blocks or limited providers. The [five-candidate sample](COHORT-5.md) shows real output and its limits.

## Coverage limits

- Log hints can change or be absent; the collector has no historical backfill and does not guarantee every creation.
- It inspects top-level `create` and `create_v2` instructions only. It does not decode inner CPI creates, unsupported formats, quote assets, holders, launch-block activity, creator history, liquidity or prices.
- Confirmed transactions can later be affected by chain reorganization. The collector does not independently verify finalization.
- Provider rate limits, unavailable `getTransaction` results, queue overflow, connection closes and unverified create hints are reported as gaps or counters. Do not infer zero launches from an empty output file.
- The code path is covered by mocked WebSocket and RPC tests. One [bounded public-mainnet smoke test](COLLECTOR-SMOKE.md) found a confirmed creation. **No real provider completeness or Photon-speed claim has been measured.**

To build trading evidence from a candidate, a separate collector must fetch point-in-time creator, holder, liquidity and exact launch-slot data with coverage metadata. Late forensic scans cannot be used as if known at decision time.

Sources: [official Pump IDL](https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json), [Solana logsSubscribe](https://solana.com/docs/rpc/websocket/logssubscribe), [Solana getTransaction](https://solana.com/docs/rpc/http/gettransaction), [Solana getBlock](https://solana.com/docs/rpc/http/getblock).
