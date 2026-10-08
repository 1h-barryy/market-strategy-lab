import { defineConfig } from 'vite';

export default defineConfig({
  base: '/market-strategy-lab/',
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
