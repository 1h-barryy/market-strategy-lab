# Market Under Stress

<!-- TEMPLATE ONLY: replace every prompt below in your own words as features are actually implemented. Do not submit the outline as a completed README. -->

## What this project does

**Phase 1 scaffold:** Vite, TypeScript, and Three.js render a procedural test chamber with editable Fast MA, Slow MA, and Exposure controls. `RUN TEST` displays `BACKTEST ENGINE NOT CONNECTED`; all numerical results remain `--`. No market data, trading signals, backtesting, or financial calculations are implemented.

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

Open the local URL printed by Vite, under `/market-under-stress/`.

Source responsibilities:

```text
src/
├── main.ts
├── vite-env.d.ts
├── app/                 Application orchestration and placeholder state
│   ├── App.ts
│   ├── state.ts
│   └── state.test.ts
├── model/               Reserved; no quantitative engine yet
├── world/
│   ├── World.ts         Camera, lighting, resize, animation, disposal
│   └── assets/lab.ts    Procedural platform and core
└── ui/
    ├── UI.ts            DOM controls and placeholder results
    └── styles.css
```

## Data, assumptions, and limitations

<!-- Explain synthetic data, the MA rule, delayed execution, costs, drawdown, sample reuse, benchmarks and limits on real-world interpretation. -->

## My contributions and what I learned

<!-- Name actual files/commits and substantive changes you made. Do not describe planned or AI-authored changes as your own work. -->

## AI use and references

<!-- Briefly name actual tools/models and tasks, cite adapted work, and point to the separate prompt_log.md. -->

## Secrets and deployment

The scaffold is entirely client-side and requires no secrets or backend. Vite uses the base path `/market-under-stress/`. The workflow in `.github/workflows/deploy.yml` tests, builds, and deploys `dist` on pushes to `main` or manual dispatch. In a GitHub repository named `market-under-stress`, choose **Settings → Pages → Source → GitHub Actions**. If your deployment branch differs, update the workflow trigger. Deployment has not been run or verified.

<!-- State whether the implemented app uses secrets/backend services. For the intended static MVP: no private keys belong in the frontend or repository. Describe actual hosting. -->

## Device support and known issues

Desktop-first layout; the panels stack on narrow screens. The renderer follows its container size and caps pixel density at 2. Reduced-motion preferences disable the decorative animation. If WebGL initialization fails or the context is lost, a visible fallback keeps the controls usable; reload to retry 3D. The core is decorative and does not represent computed results.

<!-- Record tested browsers/devices, small-screen/WebGL fallback behavior and real known issues. -->

## AI-generated scaffold notice

This file retains an AI-generated portfolio outline. The Phase 1 implementation, setup instructions, source structure, and deployment preparation were added with Codex assistance. Unfilled sections remain prompts, not implemented features or personal contribution claims. The design and planning documents in this starter pack were prepared with ChatGPT assistance.
