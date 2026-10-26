# Input data and honest measurement

Each line is one JSON object for one **unique launch mint**. Sort rows by `signal.observedAtMs` for paper replay. Duplicate mints are counted once by replay and skipped by paper replay. This is a contract for imported evidence; the project does not currently collect these fields from Solana.

```json
{
  "signal": {
    "mint": "PUBLIC_BASE58_MINT",
    "slot": 123,
    "launchAtMs": 1000000,
    "observedAtMs": 1001200,
    "programVerified": true,
    "quoteSupported": true,
    "evidenceComplete": true,
    "creatorHistoryComplete": true,
    "creatorPriorLaunches": 1,
    "creatorPriorRugs": 0,
    "topTenPct": 20,
    "bundlePct": 3,
    "liquiditySol": 5
  },
  "outcome": {
    "labelDefinition": "net-positive-after-costs-at-30m-v1",
    "favorableAt30m": true,
    "paperQuote": {
      "entryPriceSol": 0.000001,
      "exitPriceSolAt30m": 0.0000011,
      "entryQuoteAtMs": 1001200,
      "exitQuoteAtMs": 2801200,
      "entrySlippageBps": 50,
      "exitSlippageBps": 50,
      "buyFeeBps": 100,
      "sellFeeBps": 100,
      "fixedCostsSol": 0.000005
    }
  },
  "timing": {
    "eventAvailableAtMs": 1001000,
    "ingestedAtMs": 1001200,
    "decisionAtMs": 1001202,
    "submittedAtMs": 1001210,
    "confirmedAtMs": 1001610
  }
}
```

The example above is a **format illustration**, not a real mint or measurement. `signal` must contain only facts observed before `observedAtMs`. Missing critical coverage should set `evidenceComplete` or `creatorHistoryComplete` false and lead to `ABSTAIN`; do not fill unknown holder or bundle values with zero while marking coverage complete. The policy thresholds are illustrative and not empirically calibrated. Record the evidence source and observation slot in any real dataset; redact provider credentials.

`favorableAt30m` means the hypothetical 30-minute exit would have **positive net SOL PnL after both trading fees, slippage, and fixed transaction costs**, under a documented entry rule. Its exact source and cost assumptions must accompany a research dataset. The reporter enforces the label-definition string but cannot verify the truth of the label. A future dataset should label all observed launches, including failed, illiquid and inactive ones, then hold out a later time period for evaluation.

`paperQuote` is optional, but every `BUY` needs it for a complete paper PnL report. Entry quote time must be no later than decision time, and by default no more than one second stale. Exit quote time must equal decision time plus 30 minutes. The simulator subtracts the declared fixed cost once, spends at most the policy's `maxSpendSol`, and applies supplied fees and slippage on both sides. It settles positions at their exit times and enforces cash and a three-position default. It does not model partial fills, liquidity impact, priority auction, failed transactions, or actual confirmation timing.

`timing` is optional. Its timestamps must be ordered. The latency report gives p50, p95 and p99 of each observed stage and counts samples per stage. No timestamp is independently verified. The included synthetic dataset deliberately has **no timing**, so its latency report is empty rather than a false speed claim.

## Metrics

| Name | Meaning |
|---|---|
| Precision | Labeled `BUY` launches with positive outcome / all labeled `BUY` launches |
| Recall | Labeled positive `BUY` launches / positive launches that were `BUY` or `SKIP` |
| False-positive rate | Labeled negative `BUY` launches / negative launches that were `BUY` or `SKIP` |
| Abstention rate | `ABSTAIN` decisions / unique launches |
| Quote coverage | `BUY` decisions with supplied valid paper quotes / all `BUY` decisions |

Abstentions are excluded from precision, recall and false-positive-rate denominators; always report abstention rate alongside those metrics. A small or selected cohort can make all of these numbers misleading. The three synthetic examples are **tests only**.
