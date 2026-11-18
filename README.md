# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/YOUR-GITHUB-LOGIN/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/YOUR-GITHUB-LOGIN/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — a pre-token protocol radar. It reads a frozen DefiLlama snapshot (758 protocols, 14 Nov 2026), covers all 40 watchlist protocols and every other pre-token protocol the snapshot can rank (198 rows in all), and ranks them by an implied value computed from the snapshot's own figures: TVL × a live category multiple (the median market-cap / TVL of the live-token protocols in the same category, computed from the snapshot itself) × seven-day growth × maturity (how long the protocol has run with no token). Every row carries a concrete 7-step farm plan with costs and times, derived from the protocol's category, chains, TVL and age. The dashboard is a static, sortable, filterable page with a detail view per protocol and a live model sandbox — no network, no framework.

## Run it

```sh
# With the kit's sealed snapshot mounted at /input (as the grader does):
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

# Or point at any snapshot file:
node main.ts --input /path/to/snapshot.json --output out
```

The program writes `board.json`, `data.js`, `dashboard/` and `screenshots/` into the output directory, plus `dossier.json`. It runs twice with byte-identical output. Requires Node.js 22.18 or later (24 works too); standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
