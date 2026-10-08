# Market Strategy Lab

    An Interactive 3D Market Experiment

This is a interactive 3D experience that combines quantitative trading with a playable pinball machine. 

The main idea is to explore the difference between finding a real market pattern in the market that looks unpredictable.


## 1. What I Built

I wanted to make something related to quantitative trading, but more interactive than a typical stock dashboard. Inspired by Bruno Simon's website, I used a Galton board to visualize market behavior.

Each ball represents a stock, and each row of pegs represents a trading day. Players can change the market's behavior, explore the results, and test whether a trading strategy actually works or just got lucky.


## 2. How to Use

The project has three chapters:

- **The Board:** Adjust Mood and Yesterday to change how stocks move through the board.
- **The Terrain:** Explore how the market develops over 250 trading days in a 3D visualization.
- **The Test:** Choose a trading rule, test it on new stocks, and compare its performance against a random market.

**[Launch the Web App](https://1h-barryy.github.io/market-strategy-lab/)**


## 3. Features I'm Most Proud Of

- "Interactive Market Model": The Galton board is driven by a simulated market model rather than physical collisions.
- "3D Market Terrain": A visualization of how stock distributions change over time, connected directly to the board.
- "Strategy Testing": Players can test trading rules on new data and compare the results against random outcomes.

## 4. Run Locally

Requires Node.js 22.12 or later.


npm ci
npm run dev


To run tests or build the project:

npm test
npm run typecheck
npm run build


## API keys

The project runs entirely in the browser and does nor use a api key, a backkend or any private credentials. As of right now its only using synthetic market data.


## AI Usage

I used ChatGPT and claude for brainstorming and step planning. I use both claude code and codex to assist with coding and debugging during development.


## 7. Device Support

This project is designed for **desktop browsers with WebGL support**. Mobile devices are not currently supported.

If WebGL is unavailable, the 3D scene cannot run.