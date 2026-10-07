import { defineConfig } from 'vite';

export default defineConfig({
  base: '/2025-10-07_market-strategy-lab/',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});
