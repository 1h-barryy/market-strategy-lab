# Technical specification — Strategy Lab v0.2

Status: proposed implementation contract, not executed application code. Read `../DESIGN.md` first. This document defines a deliberately small simulator, not a faithful market or execution model.

## 1. Boundaries and defaults

Vite + TypeScript + Three.js; ordinary HTML/CSS UI; Vitest for model tests. Run all computations in the browser. No backend, API keys, arbitrary user code, React requirement, or physics engine.

Defaults are demonstration choices, not market estimates:

| Setting | Value |
|---|---:|
| Initial asset price | 100 |
| Initial account equity | 100 normalized units |
| Indicator warmup | 120 prior closes, including the segment boundary close |
| History scoring period | 252 simulated daily intervals |
| Future scoring period | 126 simulated daily intervals |
| Future paths per batch | 100 |
| Visible future paths | at most 30, deterministically sampled |
| Fast / slow windows | 10 / 50 |
| Entry allocation | 0.5 |
| Proportional one-way cost `c` | 0.001 = 10 basis points of traded notional |
| Maximum drawdown limit | 0.20 |
| History seed | 271828 |
| Base future seed | 314159, plus explicit batch ID |

Use full precision in computation and round only for display. Assumed daily steps do not imply real calendar dates. No annualized Sharpe is required for this MVP.

## 2. Market generator

Synthetic log-price process with a serially dependent component:

```text
u[t] = phi[t] * u[t-1] + innovationSigma[t] * epsilon[t]
g[t] = driftPerStep[t] + u[t] + shock[t]
P[t] = P[t-1] * exp(g[t])
epsilon[t] ~ N(0, 1)
```

Initialize `u=0` before warmup. `innovationSigma` is the standard deviation of the random innovation, not automatically the unconditional volatility of the complete return. Do not call this exact GBM when `phi != 0` or a shock is present.

| Scenario | driftPerStep | phi | innovationSigma | shock |
|---|---:|---:|---:|---|
| History / Unchanged | 0.0002 | 0.15 | 0.012 | 0 |
| Choppy (secondary milestone) | 0 | -0.25 | 0.012 | 0 |
| Shock | 0.0002 | 0.15 | 0.012 | `log(0.88)` at future step 40 only |

Shock applies an additional 12% multiplicative price reduction relative to the paired unchanged price at that step, on top of its ordinary random return; it is not a guarantee that the total one-step return equals exactly -12%. Because `u` does not include the jump, the extra shock is not fed back through phi.

Future branches begin at the final history price, with the same last latent `u` and the same last 120 history closes. Each branch receives independent future innovations. A new strategy version reuses market data rather than changing it.

For paired Unchanged/Shock comparisons, use the same `epsilon[pathId][step]` and change only the shock term. Never choose seeds based on whether they produce a dramatic failure. Choppy changes the process; it is not a same-process generalization test.

Seeds / batch IDs are provenance, not security. Derive future RNG state from base seed + batch ID + path ID; do not include strategy settings or scenario ID in that derivation. Reuse innovations across paired scenarios. Decorative RNG must be separate.

At generation, reject non-finite or nonpositive prices with a visible error. Do not silently clip prices or replace a bad path with a favorable sample.

## 3. Rule and signal

For a complete window ending at close t:

```text
SMA_W[t] = mean(P[t-W+1], ..., P[t])
desiredLong[t] = SMA_F[t] > SMA_S[t]
```

Require integer `5 <= F <= 30`, integer `20 <= S <= 120`, `F < S`, `a in {0, .25, .5, .75, 1}`. Before indicators have enough data, remain flat; do not fill missing values with future prices. Equality means flat.

First version supports only long-or-cash moving-average rules. No forecasting network, shorting, leverage, stop loss, or daily target-weight rebalancing.

## 4. Execution: signal now, trade at the next sampled close

This simulator has closing prices only. It deliberately models a one-bar execution delay: information through `P[t]` determines a queued order filled at `P[t+1]`. The new position does not earn the already-completed `t → t+1` move. This is a disclosed toy execution convention, not a claim about real fills. [S6]

For every scored segment:

1. Start at boundary close `P[0]` with cash 100, shares 0. Use prior closes solely to initialize indicators. Queue the signal from the boundary close.
2. For each step `t=1..H`, value old holdings at `P[t]` before trading. Execute the pending signal from `t-1` unless this is the terminal liquidation step.
3. Record post-trade equity, cash, shares and fees at t. Then compute the signal using information only through t and queue it for t+1.
4. At the known end `t=H`, cancel pending entries and liquidate existing holdings at `P[H]`, charging the sell cost. All comparisons use the same scheduled terminal liquidation. No new buy-and-immediate-sell at H.

Trade on state changes only. If the desired state is already held, do nothing. Once bought, keep the share count fixed until the exit signal. Allocation is an entry fraction, not a permanent portfolio-weight cap.

### Cost-aware entry from cash

Let E be account equity (all cash before entry), p the execution price, a the desired fraction of post-cost equity, and c the one-way proportional cost.

```text
sharesBought = a * E / (p * (1 + a*c))
buyNotional  = sharesBought * p
buyCost      = c * buyNotional
cashAfterBuy = E - buyNotional - buyCost
```

This gives `buyNotional / postCostEquity = a`. At a=1 it does not create negative cash. At a=0 there is no order and no fee.

### Exit

```text
sellNotional = shares * p
cash += sellNotional * (1-c)
shares = 0
```

The cost parameter is a simplified combined trading-cost assumption, not a quote from a broker. No volume impact, separate bid/ask spread, taxes, borrowing, dividends or cash interest are modeled. [S7 supports including trading costs generally, not this numerical choice.]

## 5. Baselines and evaluation

Cash: stays at 100 with no trades. Buy-and-hold: queues a full-allocation buy at boundary 0, fills at close 1, holds fixed shares, liquidates at H. It uses the same market path and cost convention as the strategy.

Each future branch is a fresh account normalized to 100. History account profit is not secretly carried into future evaluation. This isolates forward performance of the frozen rule. Use the history tail for indicators, not future prices.

For path equity E[0..H], including initial 100 and final liquidation:

```text
netReturn = E[H] / E[0] - 1
peak[t] = max(E[0], ..., E[t])
drawdown[t] = 1 - E[t] / peak[t]
maxDrawdown = max(drawdown)
withinLimit = maxDrawdown <= 0.20
excessReturn = strategyNetReturn - buyHoldNetReturn
```

Use the same observation convention for all paths: post-trade closes plus initial equity. There is no claim to capture intraday drawdown.

Batch outputs: count within limit / N; median net return; fraction with positive net return; fraction outperforming buy-and-hold (strict `>`); median excess return. Details include path return, max drawdown, traded notional costs, fill count and transaction ledger.

Keep returns, profits and risk-limit results distinct. Count every path, including losing and threshold-breaching paths. Do not stop a path when it breaches the limit. Zero trades is valid and must be visible. No arbitrary overall score or guaranteed expected alpha.

## 6. Contracts / source files to implement

Suggested names; create them during the relevant milestone, not as fake completed code now.

```text
src/model/types.ts       StrategyConfig, MarketPath, Trade, BacktestResult, BatchResult
src/model/random.ts      reproducible RNG + normal sampler
src/model/market.ts      makeHistory(), makeFutureBatch()
src/model/strategy.ts    validateConfig(), computeSignals()
src/model/backtest.ts    runBacktest(), runCash(), runBuyHold()
src/model/metrics.ts     drawdown, returns, paired batch summaries
src/model/experiment.ts frozen strategy/batch/scenario result records
```

Result identity must include model version, strategy version and config snapshot, history seed, batch ID, path ID, scenario, horizon, costs and risk threshold. Immutable computed data is shared by chart, stats and scene. No Three.js imports in `src/model/`.

Avoid a giant framework or deep inheritance. Pure functions and typed arrays/objects are sufficient. Start with measured small batches; add a browser Web Worker only if profiling shows blocked interaction. A Web Worker is still client-side, not a backend.

## 7. Playback and state integrity

Compute a result once, then replay it. UI may say “simulated playback”; never imply it is live trading. While revealing, only show the current prefix or label full-results summaries clearly as complete/precomputed. Full final results appear at RESULTS.

`src/app/state.ts` owns phase, frozen config, current run ID, batch ID, scenario and selected path. `controller.ts` validates actions. `playback.ts` owns one simulation clock; pause, reduced motion and tab visibility cannot change financial outcomes.

Invalidating a run must invalidate old async responses. Editing config marks current results as belonging to the previous version. Prevent parameter mutation while computing/replaying. Reset cannot create unlogged new markets or modify archived comparisons.

A seen batch is not an independent holdout after tuning on it. Flag reused batches. This limitation follows the general risk of tuning to test data; the proposed labeling is this project's own design. [S6]

## 8. Required tests before 3D polish

| Test | What it protects |
|---|---|
| Same config, seed, batch → same paths and results | Reproducibility |
| Different strategy settings → identical underlying market samples | Fair comparison |
| Alter only future prices; earlier signals/orders remain unchanged | No look-ahead |
| Queued entry at t cannot earn t→t+1 return | Correct execution delay |
| F>=S, missing data, non-finite values rejected | Input/data integrity |
| a=0 → cash, zero trades/fees/return/drawdown | No fake activity |
| a=1 entry never borrows to pay fees | Cash accounting |
| Positive costs reduce wealth for an identical fixed trade ledger | Cost accounting |
| Terminal liquidation charged exactly once | Horizon integrity |
| Hand-drawdown series [100,120,90,108] → MDD .25 | Peak-relative risk |
| Synthetic fixtures distinguish strategy from buy-hold | Rule really trades |
| Shock and baseline match until step 39 under paired innovations | Causal stress comparison |
| All N paths included; visible subset does not alter stats | No cherry-picking |
| Editing creates draft/version; reused batch marked seen | Evaluation provenance |
| Reset mid-run blocks old completions; double run blocked | State integrity |
| Pause, frame rate, camera and resize leave financial results unchanged | Model/view separation |

A hand-check execution fixture can supply forced signals separately from the MA rule: P=[100,110,99], initial queued long, H=2, a=1. With zero cost the buy is at 110, terminal sell at 99, final equity 90. With cost c, final equity is `100 * 0.9 * (1-c)/(1+c)`.

These are required checks, not statements that any tests currently pass.

## 9. Explicit omissions

Not calibrated to real prices. No credible real-world probability inference, perfect stop-loss fills, execution guarantees, market impact, endogenous herding, multivariate correlations, formal search-adjusted statistical significance or production order management. Same-process new samples test a specified synthetic process, not “all markets.”

References [S6] and [S7] are indexed in `SOURCES.md`; all formulas, defaults and software boundaries above are this project's proposed design except where explicitly attributed.
