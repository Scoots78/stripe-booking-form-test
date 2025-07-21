import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // Serve and build the application from the `/stripetest/` sub-directory
  // This ensures all asset URLs and router history work correctly when
  // the app is deployed under `/stripetest` instead of the web root.
  base: '/stripetest/',
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Use esbuild (default) for minification to avoid requiring the optional `terser` dependency
    minify: 'esbuild',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@stripe/react-stripe-js', '@stripe/stripe-js', 'axios'],
  }
})
