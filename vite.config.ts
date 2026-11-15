import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function copyStaticDirsPlugin(dirs: string[]) {
  return {
    name: 'copy-static-dirs',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      for (const dir of dirs) {
        const src = path.resolve(__dirname, dir);
        const dest = path.resolve(outDir, dir);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true });
        }
      }
      const rootGlb = path.resolve(__dirname, 'kepler.glb');
      if (fs.existsSync(rootGlb)) {
        fs.copyFileSync(rootGlb, path.resolve(outDir, 'kepler.glb'));
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      copyStaticDirsPlugin(['assets', 'audio', 'data', 'anatomy', 'kepler-modle-main']),
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
