import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Reader runtime only sees assets/public (git-ignored); raw .asset files stay out of dist.
  publicDir: 'assets/public',
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
