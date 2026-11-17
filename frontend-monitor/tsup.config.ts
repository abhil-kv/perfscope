import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react.ts',
    preact: 'src/preact.ts',
    vue: 'src/vue.ts',
    vite: 'src/vite.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: true,
  treeshake: true,
  sourcemap: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'preact', 'preact/hooks', 'vue', 'vite', 'ws', 'web-vitals'],
});
