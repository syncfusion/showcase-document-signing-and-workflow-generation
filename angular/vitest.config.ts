import { defineConfig } from 'vitest/config';

// The shared, framework-free modules' unit tests (the same 18 cases as the React reference, plus the catalogue identity check).
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.spec.ts'] } });
