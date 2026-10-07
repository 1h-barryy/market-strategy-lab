Market Under Stress — Design Document

Version: 0.5 (supersedes v0.2)

Changelog: 0.5: every path is 250 days, the board shows the first n (open question 1 resolved); Chapter 2 rewritten as a terrain behind the board in one continuous scene, with ghost surface, day scrub, captions and % axis extent; Chapter 2 vocabulary; P0.5 done, P1 scoped.
0.4.1: the ρ control is called Yesterday for players (Herd stays the internal name); "stocks" used consistently in player text; mood captions say "overall".
0.4: framing (pinball machine, stocks, days, the crowd), player vocabulary that hides model symbols, Chapter 1 rewritten with guided intro, live captions and visible Herd; legibility principle; P0.5 milestone inserted, P0 done.
0.3.1: drift and inertia re-parameterized to be independent (stationary π + ρ); ghost/luck baseline defined as same π, ρ = 0; P0 board decisions recorded; deploy base path set to the repo name.

Status: Pre-production. P0 and P0.5 done: tested shared model and a legible, playable Chapter 1 (plain-language controls, captions, intro, debug overlay). P1 (Chapter 2, The Terrain) in progress. Working title: Market Under Stress (subject to change)

1. Vision

An interactive 3D experience where the math model is the gameplay. Every control the player touches is a real parameter of a real model, and every shape on screen is that model's output, not decoration.

The subject is quantitative trading, reduced to its core question:

Is there structure in this market I can exploit, or is it just noise?

The player builds a market, reads its shape, bets on it with a strategy, and then has to prove the bet was real rather than lucky.

Design pillars
Honest math. What you see is what the model computes. No faked distributions, no physics engine bending results. All data-producing randomness is seeded and reproducible.
Touch the parameter, not a form. Parameters are changed by acting on objects in the world (tilting a board, turning a dial), not by filling in side panels.
One causal chain. Each chapter consumes what the previous one produced. The player's choices in Chapter 1 shape everything after it.
Light comes from data. Color and glow carry meaning. If something glows, it is because the model says it matters.

1.1 Framing

The market is a pinball machine. Each ball is a stock. Each row of pegs is a day. What pushes the ball left or right is the crowd, and the crowd can panic, get excited, and chase whatever just happened. Can you see through the machine?

Rules:
The framing must stay true to the model. Balls never interact. Yesterday (internally: Herd) means the crowd reacts to this stock's own previous move; never describe it as balls copying each other.
No characters, no plot. Only this premise and a consistent vocabulary.
Chapter 3's player role is the gambler: design a betting rule, then find out whether you saw through the machine or just got lucky.

1.2 Player vocabulary

Player-facing text never shows model symbols. All player-facing strings live in one copy file (src/content/copy.ts), structured so a second language can be added.

Model	Player sees	Control ends
ρ	Yesterday ("How the crowd reacts to yesterday's move"; internal name Herd)	"Turns against it" ← "Ignores it" → "Chases it"
tilt / π	Mood	"Panic" ← "Calm" → "Optimism"
σ	hidden in Chapter 1	—
n	Days	each row is one trading day
ball	a stock	
bin	where the stock ends up after N days (% gain/loss)	
ρ = 0 overlay	"If the crowd ignored yesterday"	

Chapter 2 (The Terrain). One-line idea: "The pile was one day. This is the whole year."
Model	Player sees
density surface over (day, position)	the terrain: "where stocks are, day after day"
density	height: "how many stocks are there"
spread growing with t	the valley opening up: "the future getting less certain"
ρ = 0 surface, same π	ghost surface: "if the crowd ignored yesterday" (same wording as Chapter 1); a constant-height ridge because heights are scaled per day by the ghost's peak
VR(q) > 1 / < 1	"Chases it" makes the valley open faster than the ghost; "Turns against it" makes it open slower. Said in plain words, and only once enough data supports it.
interquartile range per day	"the middle half of stocks" (lines along the valley)

Player text always says "stock", never "ball"; "ball" appears only in code and the debug overlay. Captions describe the pile overall ("pushing stocks up overall"), never every stock.

Numbers are replaced by short interpretive captions. Exact readouts (ρ, VR, measured vs. theory) remain available in a hidden debug overlay.
2. Experience Overview
Chapter	Name	Player role	Question it answers
1	The Board	Build the market	Where does randomness come from, and can it have memory?
2	The Terrain	Read the market	Does this market's shape reveal structure?
3	The Test	The gambler: bet on the machine	Did I see through the machine, or just get lucky?

The player moves linearly 1 → 2 → 3, and can return to Chapter 1 to change the world and see Chapters 2 and 3 respond.

3. The Shared Model

All three chapters run on one price process. It lives in src/model/, has no Three.js imports, and is unit-tested.

3.1 Steps

Each path is a sequence of steps ε_t ∈ {+1, −1} (one Galton peg = one step).

The steps form a two-state Markov chain with two independent knobs:

Drift (tilt) sets the long-run (stationary) probability of an up-step: π = 0.5 + tilt
Inertia (ρ) makes each step depend on the previous one:
P(ε_t = +1 | ε_{t−1} = +1) = π + ρ · (1 − π)
P(ε_t = +1 | ε_{t−1} = −1) = π · (1 − ρ)
The first step is drawn with probability π, so the chain starts in its stationary state (no transient).

Properties, for every allowed tilt and ρ:
Long-run share of up-steps is π, so the mean step (drift) is 2π − 1, independent of ρ.
Lag-1 autocorrelation of steps is exactly ρ; lag-k autocorrelation is ρ^k.
Step variance is 4π(1 − π).

Ranges: tilt ∈ [−0.1, 0.1] (π ∈ [0.4, 0.6]), ρ ∈ [−0.6, 0.9]. Both transition probabilities stay inside [0, 1] across this whole box, so no clamping is needed; the model rejects parameters outside it.

Why drift and inertia are parameterized separately: in a naive form (P(+1) = p + (ρ/2)·ε_{t−1}), inertia also changes the long-run drift, to (2p − 1)/(1 − ρ). Momentum would then shift where outcomes are centered, not just how wide they spread, and every ρ = 0 comparison (the binomial overlay, the Chapter 2 ghost, the Chapter 3 luck baseline) would mix "more drift" with "more structure". Fixing π as the stationary probability keeps tilt the only source of drift and ρ the only source of memory.

ρ	Behavior	Market reading
> 0	Steps repeat; runs get long; outcomes spread wide	Momentum / herding: what rose keeps rising
= 0	Independent steps; classic binomial → normal	Pure noise: the past says nothing about the future
< 0	Steps alternate; outcomes cluster in the center	Mean reversion: overreaction gets corrected

ρ is the single most important parameter in the project. Without inertia there is nothing for a strategy to exploit, and any profit is luck.

3.2 Price

Log-price accumulates scaled steps; price is its exponential:

L_t = L_{t−1} + σ_step · ε_t
S_t = S_0 · exp(L_t)

Parameters: tilt (drift), σ_step (volatility: log-price change per step), ρ (inertia), n (steps per path), seed.

Final position X_n = Σ ε_t (in steps) has mean n(2π − 1) and variance 4π(1 − π) · [n + 2 Σ_{k=1}^{n−1} (n − k) ρ^k]. Final log-return is σ_step · X_n.

Batches: a batch is generated once per parameter change and stored in app state. Path i is seeded from (seed, i), so a path does not depend on batch size or on which other paths were drawn.

Path length (resolves open question 1): every stock's path is 250 days (one trading year), so n = 250 in the shared batch of 2,000 stocks. The board shows only the first n_board days (Days, 8–24); Chapter 2 shows all 250; Chapter 3 uses the same length. Changing Days therefore never regenerates the batch. Regeneration (2,000 × 250 steps) runs at most once per animation frame while a control is being dragged.

3.3 Key property: variance ratio

For q-step returns, the variance ratio is

VR(q) = Var(q-step return) / (q · Var(1-step return))

Because the lag-k autocorrelation is ρ^k for any π, the theoretical value depends on ρ only, not on drift or σ_step:

VR(q) = 1 + 2 Σ_{k=1}^{q−1} (1 − k/q) · ρ^k

ρ = 0 → VR = 1 (spread grows like √t)
ρ > 0 → VR > 1 (spread grows faster); for large q, VR → (1 + ρ) / (1 − ρ), e.g. ρ = 0.3 → ≈ 1.86
ρ < 0 → VR < 1 (spread grows slower)

Estimator (used by the readouts and tests): split every path in the batch into non-overlapping q-step blocks, pool all block sums, and take their sample variance (around the pooled mean); divide by q times the sample variance of all single steps. Pooling across many paths keeps the estimate stable even when n is small.

This is a real statistical test used in quant research, and it is what Chapter 2 makes visible.

4. Chapter 1 — The Board

Role: The player builds the market: sets the crowd's Mood and how it reacts to Yesterday, then watches stocks fall through the days.

In this chapter (vocabulary from §1.2): a ball is a stock, a row of pegs is one trading day, a bin is where the stock ends up after N days, labeled as % gain/loss. The outline over the bins is "If the crowd ignored yesterday".

Interaction
Drop stocks: click/hold (or hold Space) to release balls; each ball is one stock's path over N days.
Mood (tilt): "Panic" ← "Calm" → "Optimism". Keyboard ←/→.
Yesterday (ρ, internally Herd): "Turns against it" ← "Ignores it" → "Chases it". Keyboard ↑/↓. The core control of the chapter.
Days (n): one row per trading day.
σ and seed are not player controls. σ is fixed in Chapter 1 and only scales the % labels; seed lives in the debug overlay.
Inspect a stock: click a landed ball; its days unroll into a price line beside the board, labeled in plain words ("This stock's 12 days", start price, end price, % change).
Debug overlay: the D key toggles the exact readout table and the dev panel (all model parameters, measured vs. theory). Hidden by default.

Guided intro (skippable, replayable; each step is one or two short lines)
1. Premise. Mood and Yesterday are locked at neutral. "Drop some stocks." The bell shape forms; the caption explains it.
2. Mood unlocks. Moving it shifts everything.
3. Yesterday unlocks. The "If the crowd ignored yesterday" outline stays fixed while the pile pulls away from it. The caption names the gap between pile and outline as the crowd's behavior.
4. Free play.

Making Yesterday (Herd) visible
While falling, each ball carries its previous move: its color is the direction of its last move (warm = up, cool = down) and a short trail keeps that color across steps. With "Chases it", balls hold one color through long runs; with "Turns against it", they flicker. This is the ball's own history, never other balls.

Live captions
One or two sentences interpret the pile against the "ignored yesterday" baseline:
Spread clearly wider → the crowd is chasing; outcomes are more extreme, big wins and big losses both more common.
Spread clearly narrower → the crowd keeps reversing; stocks end up closer to where they started.
About the same → no visible pattern yet.
Average clearly shifted → Mood is pushing everything up or down.
No pattern is claimed until enough balls have landed; until then the caption asks for more balls. The rules are a pure function (measured stats in, caption key out) with unit tests.

Board mapping (P0 decisions)
One row of pegs = one step; the board has n_board rows (Days, 8–24) and n_board + 1 bins, and shows the first n_board days of each 250-day path.
Moving right = up-step (+1). A ball's horizontal position is its running count of steps, so the board geometry is fixed and does not change with σ_step. σ_step shows up on the price-line scale and in the log-return labels under the bins.
Ball k released is path k of the precomputed batch in app state, so the board reveals the stored batch in order rather than drawing new randomness.

What the player should see
Yesterday "Ignores it" (ρ = 0): bins fill into a bell that matches the outline, Binomial(n, π) with the same Mood.
"Chases it" (ρ > 0): stocks commit to a direction and run; the pile is wider and flatter than the outline.
"Turns against it" (ρ < 0): stocks zig-zag and pile up in the middle.
Mood moves the outline and the pile together.
Motion

Balls follow scripted arcs peg-to-peg, driven by the model's step sequence. No rigid-body physics: collisions between balls would distort the distribution and break reproducibility. The motion should still read as physical (arc, slight squash, bounce timing).

Output

A batch of paths with the current parameters, stored in app state and consumed by Chapters 2 and 3.

5. Chapter 2 — The Terrain

Role: The player reads the market's shape. "The pile was one day. This is the whole year."

One continuous scene
The terrain lives physically behind the board; there is no scene switch. Entering Chapter 2, the camera moves smoothly from the front view to a 3/4 elevated view so the player discovers the terrain behind the board (the terrain fades in during the move; it is hidden in Chapter 1). Leaving moves the camera back. The board, its pile and its % labels stay in place; the inspected-stock price panel is hidden in Chapter 2.

The surface
Left-right: the same position axis as the board's bins, aligned exactly in world space (one step = half a bin, so a stock's position on the terrain is its running count of up minus down days, and the % labels are the same price changes the board shows).
Depth: time, day 0 at the board, day 250 at the far end.
Height: how many stocks are at that position on that day, relative to the ghost. For each day t, both the terrain's and the ghost's density are divided by the ghost's peak density on day t (the same factor for both). Raw density makes day 1 roughly √250 ≈ 16× taller than day 250, flattening the second half of the year where the ghost comparison matters most; per-day scaling makes the ghost a constant-height ridge, a stable reference, so "Chases it" reads lower and wider than the ghost and "Turns against it" taller and narrower. Within a day, shapes stay exact, and the valley still widens as the future gets less certain. The surface starts at day 1 (day 0 is a single spike). Raw densities remain in the debug overlay.
The slice at day n_board lines up with the board's pile: same shape, same place.

Built from the shared batch (2,000 stocks × 250 days): a histogram of positions per day, smoothed with a small Gaussian kernel across positions (sd 1.5 steps; it also removes the odd/even-day lattice zig-zag) and across days with an sd of 2% of the day (none before day 25, about ±5 days at day 250, where 2,000 stocks are spread thin and spreads change by under 1% over that window), displaced into a mesh. Color follows height: dark where no stocks are, luminous at the ghost's peak. Mood and Yesterday stay available in Chapter 2; changing them reshapes terrain and ghost with a short visual morph (results change instantly; only the drawing eases).

% axis extent
Over 250 days stocks spread much wider than over n_board days (at "Ignores it", ±3 sd is ±47 steps; at "Chases it hard" ±203; Mood at its extreme shifts the center by 50 steps). The terrain keeps the board's linear scale and spans ±100 steps around the start, about 4–11× the board's width depending on Days. Linear keeps the honest message: how fast the valley opens is exactly what the player is reading, and any compressed axis would distort it. Stocks beyond ±100 steps are not dropped: each day's share beyond either edge is drawn as an "off the map" ledge at that edge, and counted in every caption and statistic. Days is only adjustable in Chapter 1, so the terrain's scale is fixed while it is on screen.

Ghost surface
A faint ghost surface shows the same world with Yesterday = "Ignores it": same Mood (same π), same σ_step, ρ = 0, computed exactly from Binomial(t, π) with the same smoothing. It is the same reference as Chapter 1's outline. The gap between terrain and ghost is the crowd's habit, now over a whole year:
Terrain wider than the ghost → the crowd chases yesterday; the valley opens faster.
Terrain narrower than the ghost → the crowd turns against yesterday; the valley opens slower.
Matches the ghost → no habit visible.

Lines along the valley
Two pairs of lines trace where the middle half of stocks are on each day: solid ones riding on the terrain, dashed ones on the ghost (on the floor they were hidden under the hills). Their opening angle is the valley opening up; their divergence is the variance ratio made visible without numbers. The ghost is also drawn as dashed cross-sections every 10 days over a faint surface, so it stays visible where the terrain is lower and pokes out where it is wider.

Interaction
Day scrub: a Day slider (1–250), or click/drag along the terrain's floor. The chosen day's slice is highlighted on the terrain and on the ghost, with a plain caption about that day.
Mood and Yesterday controls, as in Chapter 1 (no Days).
Walkers: a few stocks travel along their own paths across the terrain as glowing points.
Debug overlay (D): exact spreads, VR(q) measured vs. theory, off-map shares.

Captions (pure, tested rules in the same style as Chapter 1)
Year caption: compares the spread on day 250 with the ghost (same thresholds as Chapter 1: ±10% counts as the same, a claim needs 4 standard errors and at least 40 stocks). Wider → "opens faster"; narrower → "opens slower"; same → no habit visible. A mood sentence is added when the average has clearly shifted.
Day caption: for the chosen day, where the middle half of stocks are (as % gain/loss) and whether that is wider, narrower or about the same as the ghost on that day, under the same rules.

Intro (skippable, replayable, same pattern as Chapter 1)
1. The idea: the pile was one day, this is the whole year; drag the day.
2. The ghost: change Yesterday and watch the valley open faster or slower than the ghost.
Then free play.

Navigation
Chapter 1 free play offers "Continue to the terrain"; Chapter 2 offers "Back to the board". The camera move is the transition.
6. Chapter 3 — The Test

Role: The player bets on the structure and must prove it.

6.1 Strategy: momentum rule

Two parameters:

Lookback N: look at the last N steps.
Threshold k: if the cumulative return over the last N steps exceeds k, hold the asset for the next step; otherwise stay flat (long/flat only).

Parameter grid (6 × 6 = 36 strategies):

N ∈ {2, 4, 8, 16, 32, 64}
k ∈ {0, 0.5, 1.0, 1.5, 2.0, 2.5} × σ_step · √N (threshold scales with expected move)
6.2 Score: Sharpe ratio

Pool the strategy's per-step returns across all paths in a batch:

Sharpe = mean(strategy returns) / std(strategy returns) × √(steps per "year")

"Return per unit of risk." Steps per year is a display constant (e.g. 250).

6.3 The three-step test
Train (in-sample). Run all 36 strategies on batch A (100 paths, seed A). The grid lights up by score. The player picks a cell; the brightest is the obvious pick.
Out-of-sample. Generate batch B from the same world (same tilt, σ, ρ; new seed). Run the chosen strategy. The drop from train to out-of-sample is the overfitting gap.
Luck baseline (null test). Run the chosen strategy on 200 batches from a world with the same π (same drift) and σ_step but ρ = 0. This gives the distribution of scores luck alone can produce (including any drift the strategy earns just by being long). Because drift does not depend on ρ (§3.1), the baseline earns exactly the same drift as the real world, so drift alone cannot pass as an edge. Place the out-of-sample score in that distribution.
6.4 Verdict

Let p95 be the 95th percentile of the luck baseline.

Verdict	Condition	Meaning
Edge	out-of-sample > p95	The strategy exploits real structure
Overfit	train > p95 but out-of-sample ≤ p95	It looked real only on the data it was tuned on
Luck / no edge	train ≤ p95 and out-of-sample ≤ p95	Indistinguishable from noise
6.5 Compute budget
Grid: 36 × 100 paths × 250 steps ≈ 0.9M steps
Null: 200 × 100 × 250 = 5M steps

Both run on the main thread in well under a second. No Web Worker needed at this scale.

7. Navigation & Structure
One continuous scene: one renderer, one scene, one camera rig shared by all chapters. Each chapter owns its objects in the scene and shows or hides them; the chapter manager switches which chapter is active and the camera rig moves between the chapters' views.
Full-screen canvas. UI is a minimal overlay (HUD), not a dashboard.
Shared state: world parameters (tilt, σ, ρ, n, seed), current chapter, generated batches, strategy results. Chapters never talk to each other directly.
Locomotion: click/scroll to advance between chapters. No WASD driving in v1 (mobile and accessibility cost).
8. Art Direction

The current look (dark background, cyan lines, HUD panels) reads as default "AI tech". Target instead: playful, tactile, luminous, closer to Bruno Simon's sense that every object has character.

Principles
Color is semantic. Define a small palette with fixed meanings, used everywhere:
Warm (amber → coral): up-steps, momentum, gains
Cool (teal → blue): down-steps, mean reversion, losses
Neutral luminous white: probability density / "how likely"
One accent for the player's choices (selected strategy, inspected ball)
Light comes from data. Balls are emissive particles with trails; path lines are light traces; high-density terrain regions glow. Bloom post-processing applies only to emissive, meaningful elements.
Matte, tactile solids. Boards, pegs, bases and dials are soft matte materials, like toys or glazed ceramic, contrasting with luminous data. No holograms, no wireframe-as-style.
Controls are objects. Dials, levers and the tilting board are modeled, lit, and animated with weight (ease, overshoot, settle).
Legibility first. Art serves understanding; if a visual doesn't help the player read the model, cut it.
Restraint in UI. Small typographic HUD for numbers that must be exact (Sharpe, VR, verdict). Everything else is in the scene.
Asset approach

Procedural geometry first (fast iteration, no pipeline). Imported GLBs only where procedural can't deliver character (dials, base, board frame). Pipeline set up when the first real GLB exists.

9. Technical Architecture
src/
├── core/        Renderer, fixed-step Clock, Input/picking, Assets loader, ChapterManager, events
├── model/       Pure TS math, no Three.js, fully tested
│   ├── random.ts      seeded RNG
│   ├── process.ts     step/price process with tilt, σ, ρ
│   ├── stats.ts       histograms, density, variance ratio
│   ├── strategy.ts    momentum rule
│   └── backtest.ts    Sharpe, grid run, OOS, null distribution, verdict
├── chapters/
│   ├── types.ts       Chapter { load, enter, update(dt), exit, dispose }
│   ├── board/         Chapter 1
│   ├── terrain/       Chapter 2
│   └── test/          Chapter 3
├── content/           copy.ts: every player-facing string (per language)
├── world/shared/      stage (shared scene, lights, camera rig), palette, materials, post-processing
├── app/               state (params, chapter, batches, results), controller
└── ui/                HUD overlay, shared crowd controls (Mood, Yesterday), styles

Rules:

model/ imports nothing from the rest of the app.
Each chapter has one mapping.ts where model data becomes scene coordinates.
Simulation runs on a fixed-step clock, separate from render frames. Reduced-motion affects visuals only, never results.
10. Constraints
Platform: static web app on GitHub Pages. No backend, no API keys, no external data at runtime.
Stack: Vite, TypeScript, Three.js. No physics engine.
Data: fully simulated; no real market data in v1.
Reproducibility: every data-producing simulation is seeded.
Performance: 60 fps target on a mid-range laptop; ≤ 2 MB of assets per chapter; JS bundle split so Three.js is its own chunk.
Accessibility: keyboard-operable controls, reduced-motion support, readable contrast on HUD.
Deploy: GitHub repo 2025-10-07_market-strategy-lab; vite.config.ts base is '/2025-10-07_market-strategy-lab/'. If the repo is renamed, base must change with it.
Timeline: TBD.
11. Milestones
P0 — Prototype: the model and the board (done)

Goal: make inertia understandable by playing with it.

model/random.ts, model/process.ts, model/stats.ts with tests (seed reproducibility; ρ = 0 histogram matches binomial; measured autocorrelation ≈ ρ; VR matches expectation)
Chapter interface and chapter manager (one chapter registered)
Chapter 1 rough: instanced pegs and balls, scripted arcs, bin histogram with analytic overlay, ρ / tilt / σ controls (dev panel acceptable), click-a-ball path unroll
Debug readout: measured autocorrelation and VR
P0.5 — Legibility pass (done)

Goal: a first-time player can say what Mood and Yesterday do without seeing a number. The model does not change.

Copy layer: all player-facing strings in src/content/copy.ts
Player controls: Mood and Yesterday with end labels (no numbers), Days; σ and seed removed from player controls
Debug overlay: readout table + dev panel, hidden by default, toggled with D
Live captions from measured stats vs. the "ignored yesterday" baseline, as a tested pure function
Guided intro: premise → Mood → Yesterday → free play; skippable and replayable
Yesterday (Herd) visible on falling stocks (color + short trail of the previous move)
Inspected ball in plain words
P1 — The Terrain

Goal: a player can say, without numbers, whether this crowd's future opens faster or slower than the ghost, and why.

Shared batch at 250 days; board shows the first n_board days; regeneration coalesced to one per frame
model/stats.ts: per-day position histograms and smoothing, exact ghost density, per-day spread and quantiles, with tests (rows sum to 1; ρ = 0 spread matches theory; spread growth matches VR theory)
One continuous scene: shared stage and camera rig; camera move between board and terrain views
chapters/terrain/: TerrainChapter, mapping.ts, terrain mesh, ghost surface, off-map ledges, floor lines, day slice, walkers
Live morph on Mood / Yesterday changes
Day scrub with a plain day caption; year caption; tested caption rules
Navigation (Continue / Back) and a two-step skippable intro
Debug overlay for Chapter 2
P2 — The Test
model/strategy.ts, model/backtest.ts with tests
Grid view, train → out-of-sample → null flow, verdict display
P3 — Art pass
Palette, emissive materials, bloom, trails, matte solids, modeled controls, chapter transitions, HUD typography
Later
Mystery market: the system hides ρ; the player infers it from the terrain and confirms with the test
Selection-bias lesson: null distribution of the best of 36 strategies, showing why trying many strategies inflates results
Transaction costs, short selling
Sentiment shocks / jumps (fat tails)
Diversification chapter
Free-roaming shared world (beyond the board-and-terrain scene)
12. Open Questions
Resolved in 0.5: paths are 250 days; the board shows the first n_board (see §3.2).
Does Chapter 3 use Chapter 1's exact batch as the training set, or always a fresh batch from the same parameters?
Physical form of the inertia control: a dial, a weight on the board, or something on the balls themselves (spin, color)?
Should the luck baseline in v1 already account for selection across the 36-cell grid, or keep that for the later lesson?