import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
<<<<<<< Updated upstream
    port: 3001,
    /** Allow QA access via ngrok (friend hits https://*.ngrok-free.app → this dev server) */
    host: true,
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok.app'],
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // So the API always sees localhost Host (tenantResolver), not *.ngrok-free.app
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Host', 'localhost:4000');
          });
        },
      },
    },
=======
    port: 3000,
    // Only in development — production build uses VITE_API_BASE_URL or same-origin
    proxy:
      mode === 'development'
        ? {
            '/api': {
              target: 'http://localhost:4000',
              changeOrigin: true,
            },
          }
        : undefined,
>>>>>>> Stashed changes
  },
}));
