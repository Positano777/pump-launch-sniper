# Five real Pump creation candidates — research sample

On 2026-10-27, the read-only collector captured the first five confirmed Pump creation candidates it decoded during a bounded public-mainnet session, from **02:08:04 to 02:08:30 UTC**. It processed 4,765 Pump-related log notifications, saw five creation hints and decoded five candidates. The run reported zero fetch, decode, malformed-notification or queue-drop gaps. This is a **first-five convenience sample**, not a random or complete launch cohort.

The candidates were scanned later with finalized `getBlock` (first scan at 02:09:35 UTC). The [machine-readable cohort report](cohort-5.report.json), [creation JSONL](../examples/creations.mainnet.sample.jsonl), [slot-scan JSONL](launch-slot-mainnet-sample.jsonl), and [run status](collector-sample.status.jsonl) permit reproduction.

| Mint | Slot | Later mint-related transactions in creation slot | Provider block coverage |
|---|---:|---:|---|
| `FwRpfeVuhW2TLF6fdAQfCSwE6wdS3g2WidPoz35Xpump` | 461895487 | 13 | Complete |
| `CZLWUKGfusZYUGrjyt1jkngamW56NHSDXGdDXpfd8oHS` | 461895492 | 0 | Complete |
| `HnazomtKtsKbNWirKZAddn2PoaCdebgdb5W4VEV2adxA` | 461895495 | 0 | Complete |
| `DwZSnjm3mf8HxxuJgMW8XKaFZvqNA9K5cU7aBaRrpump` | 461895524 | 0 | Complete |
| `27Df4WL8g3ZVJQrWT2QFmavoLKPk4BBjnpZRKcN6pump` | 461895536 | 0 | Complete |

The creation transaction is **reported separately** from later same-slot transactions. Four zero counts above mean no *later mint-related transactions observed by this scan*, not no initial allocations or buyers. Creation-transaction positive token-account changes were 1,000,000,000,000,000 raw units for three coins and 2,000,000,000,000,000 for two coins. These observations do **not independently establish mint supply**; the values differ and have not been reconciled with the mint account. Positive later deltas can include transfers and repeated circulation. None of this proves a Jito bundle, coordinated ownership, or a profitable entry.

"Complete" describes the provider's returned block and this scanner's bounded relevant-transaction pass. It is not independent consensus verification. The scans happened after the candidate observations and **cannot be fed back into an immediate launch decision**. Price paths, quote asset, holder concentration, creator history, fills, fees and outcomes are absent, so this sample supports no win-rate or PnL claim.

Reproduce a report from the checked-in files:

```sh
node src/cohort-report.mjs examples/creations.mainnet.sample.jsonl docs/launch-slot-mainnet-sample.jsonl
```

To rescan with your own trusted provider, see [collector and scan setup](COLLECTOR.md).
