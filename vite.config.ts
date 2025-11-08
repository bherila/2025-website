import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    laravel({
      input: [
        'resources/css/app.css',
        'resources/js/app.jsx',
        'resources/js/navbar.tsx',
        'resources/js/finance.tsx',
        'resources/js/finance-account-maintenance.tsx',
        'resources/js/home.tsx',
        'resources/js/recipes.tsx',
        'resources/js/projects.tsx',
        'resources/js/dashboard.tsx',
        'resources/js/user/api-key.tsx',
        'resources/js/user/update-email.tsx',
        'resources/js/user/update-password.tsx'
      ],
      refresh: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'resources/js'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          'ui-core': ['@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          'ui-components': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-popover',
            '@radix-ui/react-tabs',
            '@radix-ui/react-label',
            '@radix-ui/react-checkbox'
          ],
          utils: ['lucide-react', 'date-fns', 'currency.js', 'zod'],
          charts: ['recharts'],
          markdown: ['react-markdown']
        }
      }
    }
  }
});
