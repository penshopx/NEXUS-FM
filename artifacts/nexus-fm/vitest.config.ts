import path from 'node:path';
import { existsSync } from 'node:fs';
import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const contrastTest = 'src/pages/core-pages-accessibility.browser.test.tsx';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    projects: [
      {
        test: {
          name: 'semantic-jsdom',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          clearMocks: true,
          exclude: [contrastTest, '**/node_modules/**', '**/dist/**'],
        },
      },
      {
        test: {
          name: 'color-contrast-browser',
          include: [contrastTest],
          setupFiles: ['./src/test/setup.ts'],
          clearMocks: true,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                executablePath: existsSync('/repl/tools/bin/chromium')
                  ? '/repl/tools/bin/chromium'
                  : undefined,
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});