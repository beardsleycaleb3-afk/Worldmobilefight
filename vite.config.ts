import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Copies root manifest.json, sw.js, standalone/, and src/assets into dist/ on production build.
      {
        name: 'copy-root-pwa-and-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          if (!fs.existsSync(distDir)) return;

          for (const rootFile of ['manifest.json', 'sw.js']) {
            const srcFile = path.resolve(__dirname, rootFile);
            if (fs.existsSync(srcFile)) {
              fs.copyFileSync(srcFile, path.join(distDir, rootFile));
            }
          }

          const standaloneSrc = path.resolve(__dirname, 'standalone');
          const standaloneDist = path.join(distDir, 'standalone');
          if (fs.existsSync(standaloneSrc)) {
            fs.cpSync(standaloneSrc, standaloneDist, {recursive: true, force: true});
          }

          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.join(distDir, 'src/assets');
          if (fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
