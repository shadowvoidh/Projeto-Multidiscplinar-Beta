import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dashboard',
    rollupOptions: {
      input: {
        main: './src/main.tsx',
        login: './src/login.tsx'
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
});