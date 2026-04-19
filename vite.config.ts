import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    laravel({
      input: [
        'resources/css/app.css',
        'resources/js/instrument.ts',
        'resources/js/app.jsx',
        'resources/js/navbar.tsx',
        'resources/js/back-to-top.tsx',
        'resources/js/finance.tsx',
        'resources/js/finance-account-maintenance.tsx',
        'resources/js/home.tsx',
        'resources/js/recipes.tsx',
        'resources/js/projects.tsx',
        'resources/js/dashboard.tsx',
        'resources/js/user/api-key.tsx',
        'resources/js/user/update-email.tsx',
        'resources/js/user/update-password.tsx',
        'resources/js/payslip.tsx',
        'resources/js/payslip-entry.tsx',
        'resources/js/components/rsu/rsu.tsx',
        'resources/js/components/rsu/manage-awards.tsx',
        'resources/js/components/rsu/add-grant.tsx',
        'resources/js/bingo/index.tsx',
        'resources/js/irsf461/irsf461.tsx',
        'resources/js/license-manager.tsx',
        'resources/js/client-management/admin.tsx',
        'resources/js/client-management/portal.tsx',
        'resources/js/user-management.tsx',
        'resources/js/admin-genai-jobs.tsx',
        'resources/js/utility-bill-tracker.tsx',
        'resources/js/login-passkey.tsx',
      ],
      refresh: true,
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'resources/js'),
    },
  },
  build: {
    rollupOptions: {
      external: (id) => /\.test\.[tj]sx?$/.test(id) || id.includes('/__tests__/') || id === 'pdfjs-dist',
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react/') || id.includes('react-dom/')) {
              return 'vendor';
            }
            if (
              id.includes('@radix-ui/react-slot') ||
              id.includes('class-variance-authority') ||
              id.includes('clsx') ||
              id.includes('tailwind-merge')
            ) {
              return 'ui-core';
            }
            if (id.includes('@radix-ui/react-')) {
              return 'ui-components';
            }
            if (
              id.includes('lucide-react') ||
              id.includes('date-fns') ||
              id.includes('currency.js') ||
              id.includes('zod')
            ) {
              return 'utils';
            }
            if (id.includes('recharts')) {
              return 'charts';
            }
            if (id.includes('react-markdown')) {
              return 'markdown';
            }
          }

          if (id.includes('resources/js/components/ui/')) {
            return 'ui-components';
          }
        }
      }
    }
  }
});
