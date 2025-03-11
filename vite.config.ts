import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@core': resolve(__dirname, './src/core'),
      '@utils': resolve(__dirname, './src/utils'),
      '@adapters': resolve(__dirname, './src/adapters'),
      '@cache': resolve(__dirname, './src/cache'),
      '@fk-types': resolve(__dirname, './src/types'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'FetchKit',
      fileName: format => `fetchkit.${format === 'es' ? 'mjs' : 'js'}`,
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      output: {
        exports: 'named',
        sourcemap: true,
        globals: {},
      },
    },
    target: 'es2020',
    sourcemap: true,
    minify: 'esbuild',
  },
});
