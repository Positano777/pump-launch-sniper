# Contributing

This is a public research tool. Good contributions improve evidence quality, reproducibility, safety, and clear reporting.

1. Open an issue describing the observed launch mint, slot, source, observation time, expected result, and why the existing behavior is wrong or incomplete.
2. Use synthetic or public, non-secret fixtures. Do not include wallet seeds, private keys, API keys, signed transactions ready to broadcast, or paid-provider credentials.
3. Run `npm test`. Add a test when changing policy, paper accounting, parsing or timing logic.
4. Keep model suggestions out of the deterministic trading path. A new model must remain optional and disabled unless selected by the user.
5. Mark historical outcomes and every cost assumption explicitly. Report missing data and abstentions rather than silently discarding them.

Security problems should follow [SECURITY.md](SECURITY.md), not a public issue containing exploit details.
