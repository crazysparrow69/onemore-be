import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Needs Docker (Testcontainers starts a throw-away Postgres).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.int-spec.ts'],
    root: '.',
    hookTimeout: 180_000,
    testTimeout: 60_000,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
});
