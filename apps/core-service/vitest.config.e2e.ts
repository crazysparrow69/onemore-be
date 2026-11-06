import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    root: '.',
    env: {
      NODE_ENV: 'test',
      PORT: '8080',
      LOG_LEVEL: 'error',
      APP_VERSION: 'e2e-version',
      // The pool connects lazily: /health never reaches this address.
      DATABASE_URL: 'postgresql://e2e:e2e@127.0.0.1:1/e2e',
    },
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
