Market Under Stress — Design Document

Version: 0.3 (supersedes v0.2) Status: Pre-production. Repo has a working Vite + TypeScript + Three.js scaffold; no world, models, or simulation yet. Working title: Market Under Stress (subject to change)

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
2. Experience Overview
Chapter	Name	Player role	Question it answers
1	The Board	Build the market	Where does randomness come from, and can it have memory?
2	The Terrain	Read the market	Does this market's shape reveal structure?
3	The Test	Trade the market	Is my strategy's profit an edge, overfitting, or luck?

The player moves linearly 1 → 2 → 3, and can return to Chapter 1 to change the world and see Chapters 2 and 3 respond.

3. The Shared Model

All three chapters run on one price process. It lives in src/model/, has no Three.js imports, and is unit-tested.

3.1 Steps

Each path is a sequence of steps ε_t ∈ {+1, −1} (one Galton peg = one step).

Drift (tilt) sets the base probability of an up-step: p = 0.5 + tilt
Inertia (ρ) makes each step depend on the previous one:
P(ε_t = +1 | ε_{t−1}) = clamp(p + (ρ / 2) · ε_{t−1}, 0.01, 0.99)

At p = 0.5, the probability of repeating the previous step is (1 + ρ) / 2, and the lag-1 autocorrelation of steps is exactly ρ.

ρ	Behavior	Market reading
> 0	Steps repeat; runs get long; outcomes spread wide	Momentum / herding: what rose keeps rising
= 0	Independent steps; classic binomial → normal	Pure noise: the past says nothing about the future
< 0	Steps alternate; outcomes cluster in the center	Mean reversion: overreaction gets corrected

ρ is the single most important parameter in the project. Without inertia there is nothing for a strategy to exploit, and any profit is luck.

3.2 Price

Log-price accumulates scaled steps; price is its exponential:

L_t = L_{t−1} + σ_step · ε_t
S_t = S_0 · exp(L_t)

Parameters: tilt (drift), σ (volatility, maps to peg spacing / step size), ρ (inertia), n (steps per path), seed.

3.3 Key property: variance ratio

For q-step returns, the variance ratio is

VR(q) = Var(q-step return) / (q · Var(1-step return))
ρ = 0 → VR ≈ 1 (spread grows like √t)
ρ > 0 → VR > 1 (spread grows faster); for large q, VR → (1 + ρ) / (1 − ρ), e.g. ρ = 0.3 → ≈ 1.86
ρ < 0 → VR < 1 (spread grows slower)

This is a real statistical test used in quant research, and it is what Chapter 2 makes visible.

4. Chapter 1 — The Board

Role: The player builds the market.

Interaction
Drop balls: click/hold to release balls; each ball is one price path.
Tilt the board: drag or arrow keys → drift.
Peg spacing / rows: adjust → σ and n.
Inertia dial: turn → ρ. The core control of the chapter.
Inspect a ball: click a landed ball; its bounce sequence unrolls into a price line behind the board.
What the player should see
At ρ = 0, bins fill into a clean bell curve that matches the analytic binomial overlay.
At ρ > 0, balls commit to a direction and run; the distribution visibly widens and flattens.
At ρ < 0, balls zig-zag and pile into the center bins.
Motion

Balls follow scripted arcs peg-to-peg, driven by the model's step sequence. No rigid-body physics: collisions between balls would distort the distribution and break reproducibility. The motion should still read as physical (arc, slight squash, bounce timing).

Output

A batch of paths with the current parameters, stored in app state and consumed by Chapters 2 and 3.

5. Chapter 2 — The Terrain

Role: The player reads the market's shape.

The surface
x-axis: time (step 0 → n)
z-axis: log-return
height: probability density at that time and return

It reads as a valley that opens outward over time. Built from a simulated batch (~2,000 paths): a histogram per time slice, smoothed, displaced into a mesh. Cheap to recompute on parameter change.

Reference ridge

A faint ghost surface shows the ρ = 0 shape with the same drift and volatility. The difference between the live terrain and the ghost is the structure in the market:

Terrain wider than the ghost → momentum
Terrain narrower than the ghost → mean reversion
Matches the ghost → no exploitable structure

A readout shows VR(q) for a few horizons.

Interaction
Orbit / move along the time axis.
Scrub a time slice to see that slice's distribution.
Change ρ (or return to Chapter 1) and watch the terrain morph.
Optional: release a few walkers (glowing marbles) that trace individual paths across the surface.
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
Luck baseline (null test). Run the chosen strategy on 200 batches from a world with the same tilt and σ but ρ = 0. This gives the distribution of scores luck alone can produce (including any drift the strategy earns just by being long). Place the out-of-sample score in that distribution.
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
Separate scenes with transitions: one renderer; a chapter manager moves the camera / crossfades between chapter scenes. A shared continuous world can be layered on later.
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
├── world/shared/      materials, palette, lights, camera rig, post-processing
├── app/               state (params, chapter, batches, results), controller
└── ui/                HUD overlay, styles

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
Deploy: vite.config.ts base path must match the GitHub repo name.
Timeline: TBD.
11. Milestones
P0 — Prototype: the model and the board

Goal: make inertia understandable by playing with it.

model/random.ts, model/process.ts, model/stats.ts with tests (seed reproducibility; ρ = 0 histogram matches binomial; measured autocorrelation ≈ ρ; VR matches expectation)
Chapter interface and chapter manager (one chapter registered)
Chapter 1 rough: instanced pegs and balls, scripted arcs, bin histogram with analytic overlay, ρ / tilt / σ controls (dev panel acceptable), click-a-ball path unroll
Debug readout: measured autocorrelation and VR
P1 — The Terrain
Density surface from batch, ghost ρ = 0 reference, VR readout, time-slice scrub, live morph on parameter change
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
Shared continuous world
12. Open Questions
Fixed n (e.g. 250 steps) for all chapters, or does the board use fewer rows and paths extend beyond the board?
Does Chapter 3 use Chapter 1's exact batch as the training set, or always a fresh batch from the same parameters?
Physical form of the inertia control: a dial, a weight on the board, or something on the balls themselves (spin, color)?
Should the luck baseline in v1 already account for selection across the 36-cell grid, or keep that for the later lesson?