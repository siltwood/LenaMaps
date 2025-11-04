import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Enable JSX in .js files
      include: /\.(jsx|js|tsx|ts)$/,
    }),
  ],
  esbuild: {
    // Tell esbuild to treat .js files as JSX
    include: /\.(jsx?|tsx?)$/,
    loader: 'jsx',
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
        '.ts': 'tsx',
      },
    },
  },
  server: {
    port: 3000,
    open: false,
    host: true,
    allowedHosts: [
      'chromous-unattributably-yee.ngrok-free.dev',
      'localtest.ngrok-free.app',
      '.ngrok-free.dev',
      '.ngrok-free.app'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
})
