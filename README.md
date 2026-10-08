# Market Under Stress

<!-- TEMPLATE ONLY: replace every prompt below in your own words as features are actually implemented. Do not submit the outline as a completed README. -->

## What this project does

**Prototype P1 (see `DESIGN.md` §11):** Chapters 1 (The Board) and 2 (The Terrain). The market is a pinball machine: each ball is a stock, each row of pegs a trading day, and a crowd with a Mood and a reaction to Yesterday pushes each stock up or down. Under the hood each stock is a 250-day path of a seeded two-state Markov step process (drift and inertia); the board shows its first 8–24 days. Behind the board, the terrain shows where all 2,000 stocks are on every day of the year against a ghost of a crowd that ignores yesterday, with a day scrub, plain-language captions and a few stocks walking their year. Exact statistics and the developer panel are in a debug overlay (D key). Chapter 3 (The Test) is not implemented.

<!-- Write 2–4 sentences: the user configures which rule, tests what, and sees which results. Distinguish implemented features from plans. -->

## Live app and demo

- Live app: TODO — add the verified deployed URL.
- Demo: TODO — add the verified video URL.
- Portfolio: TODO — add the actual project introduction page.

## How to use it

<!-- Describe the actual configure → history → freeze → future → stress → compare flow. Include what the controls mean. -->

## Features I am most proud of

<!-- Choose features that really work. Explain why they matter in your own voice. -->

## How it works

<!-- Briefly describe model → backtest → results → 3D, with the actual stack and the meaning of a particle/path. -->

## Run locally

Use Node.js 22.12 or later (bootstrap environment: Node.js 24.21.0).

```bash
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm run preview
```

Open the local URL printed by Vite, under `/market-strategy-lab/`.

Source responsibilities:

```text
src/
├── main.ts
├── app/                 App wiring and frame loop; state (world params + current batch)
├── core/                Renderer, fixed-step Clock, Input/picking, ChapterManager, events
├── model/               Pure TypeScript, no Three.js: random, process, stats, evidence (caption rules) + tests
├── content/             copy.ts: every player-facing string
├── chapters/
│   ├── types.ts         Chapter interface
│   ├── board/           Chapter 1: mapping.ts (model → scene), pegs, balls + trails, overlay, price line,
│   │                    intro, dev panel
│   └── terrain/         Chapter 2: mapping.ts, surfaces (terrain, ghost, lines, slice), walkers, captions, intro
├── world/shared/        stage (shared scene + camera rig), layout (board/terrain alignment), palette
└── ui/                  HUD overlay, crowd controls (Mood, Yesterday, Days), styles
```

## Data, assumptions, and limitations

<!-- Explain synthetic data, the MA rule, delayed execution, costs, drawdown, sample reuse, benchmarks and limits on real-world interpretation. -->

## My contributions and what I learned

<!-- Name actual files/commits and substantive changes you made. Do not describe planned or AI-authored changes as your own work. -->

## AI use and references

<!-- Briefly name actual tools/models and tasks, cite adapted work, and point to the separate prompt_log.md. -->

## Secrets and deployment

The app is entirely client-side and requires no secrets or backend. Vite uses the base path `/market-strategy-lab/`, matching the GitHub repository name; Three.js is built as its own chunk. The workflow in `.github/workflows/deploy.yml` tests, builds, and deploys `dist` on pushes to `main` or manual dispatch. In the repository, choose **Settings → Pages → Source → GitHub Actions**. If your deployment branch differs, update the workflow trigger. Deployment has not been run or verified.

<!-- State whether the implemented app uses secrets/backend services. For the intended static MVP: no private keys belong in the frontend or repository. Describe actual hosting. -->

## Device support and known issues

Desktop-first: full-screen canvas with a HUD column on the left and the dev panel on the right; on narrow screens these overlap the board. The renderer follows the window size and caps pixel density at 2. Reduced-motion preferences remove the ball arcs, squash and price-line unroll; they never change simulated results. If WebGL fails to start or the context is lost, a message replaces the scene; reload to retry.

<!-- Record tested browsers/devices, small-screen/WebGL fallback behavior and real known issues. -->

## AI-generated scaffold notice

This file retains an AI-generated portfolio outline. The Phase 1 implementation, setup instructions, source structure, and deployment preparation were added with Codex assistance. Unfilled sections remain prompts, not implemented features or personal contribution claims. The design and planning documents in this starter pack were prepared with ChatGPT assistance.
