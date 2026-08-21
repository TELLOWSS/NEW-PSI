import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    loadEnv(mode, '.', '');
    const projectRoot = process.cwd();
    return {
      root: projectRoot,
      cacheDir: path.resolve(projectRoot, 'node_modules/.vite'),
      envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      optimizeDeps: {
        entries: ['index.html'],
      },
      plugins: [react()],
      resolve: {
        preserveSymlinks: true,
        alias: {
          '@': projectRoot,
        }
      },
      build: {
        chunkSizeWarningLimit: 900,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
              if (id.includes('recharts') || id.includes('chart.js')) return 'chart-vendor';
              if (id.includes('@google/genai') || id.includes('@supabase')) return 'data-vendor';
              if (id.includes('html-to-image')) return 'html-image-vendor';
              if (id.includes('qrcode.react')) return 'qrcode-vendor';
              if (!id.includes('node_modules')) {
                if (id.includes('/components/charts/')) return 'charts';
                if (id.includes('/services/')) return 'services';
              }

              return undefined;
            },
          },
        },
      }
    };
});
