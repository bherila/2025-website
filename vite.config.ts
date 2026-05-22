import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

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
        'resources/js/finance/pages/account-fees.tsx',
        'resources/js/finance/pages/account-lots.tsx',
        'resources/js/finance/pages/account-maintenance.tsx',
        'resources/js/finance/pages/account-summary.tsx',
        'resources/js/finance/pages/account-transactions.tsx',
        'resources/js/finance/pages/accounts.tsx',
        'resources/js/finance/pages/all-account-fees.tsx',
        'resources/js/finance/pages/all-account-lots.tsx',
        'resources/js/finance/pages/config.tsx',
        'resources/js/finance/pages/documents.tsx',
        'resources/js/finance/pages/duplicates.tsx',
        'resources/js/finance/pages/import-transactions.tsx',
        'resources/js/finance/pages/linker.tsx',
        'resources/js/finance/pages/lot-reconciliation.tsx',
        'resources/js/finance/pages/statements.tsx',
        'resources/js/finance/pages/tags.tsx',
        'resources/js/finance/pages/tax-preview.tsx',
        'resources/js/home.tsx',
        'resources/js/recipes.tsx',
        'resources/js/projects.tsx',
        'resources/js/dashboard.tsx',
        'resources/js/user/api-key.tsx',
        'resources/js/user/update-email.tsx',
        'resources/js/user/update-password.tsx',
        'resources/js/payslip.tsx',
        'resources/js/payslip-entry.tsx',
        'resources/js/phr/pages.tsx',
        'resources/js/address-labels/index.tsx',
        'resources/js/components/rsu/rsu.tsx',
        'resources/js/components/rsu/manage-awards.tsx',
        'resources/js/components/rsu/add-grant.tsx',
        'resources/js/bingo/index.tsx',
        'resources/js/games/cars/index.tsx',
        'resources/js/irsf461/irsf461.tsx',
        'resources/js/financial-planning/index.tsx',
        'resources/js/financial-planning/retirement-contribution-calculator.tsx',
        'resources/js/financial-planning/rent-vs-buy.tsx',
        'resources/js/financial-planning/roth-conversion.tsx',
        'resources/js/markdown-renderer/index.tsx',
        'resources/js/license-manager.tsx',
        'resources/js/class-action-tracker.tsx',
        'resources/js/client-management/admin/agreement.tsx',
        'resources/js/client-management/admin/create.tsx',
        'resources/js/client-management/admin/index.tsx',
        'resources/js/client-management/admin/show.tsx',
        'resources/js/client-management/portal/agreement.tsx',
        'resources/js/client-management/portal/billing.tsx',
        'resources/js/client-management/portal/expenses.tsx',
        'resources/js/client-management/portal/index.tsx',
        'resources/js/client-management/portal/invoice.tsx',
        'resources/js/client-management/portal/invoices.tsx',
        'resources/js/client-management/portal/project.tsx',
        'resources/js/client-management/portal/time.tsx',
        'resources/js/user-management.tsx',
        'resources/js/admin-genai-jobs.tsx',
        'resources/js/admin-tax-normalization.tsx',
        'resources/js/utility-bill-tracker/accounts.tsx',
        'resources/js/utility-bill-tracker/bills.tsx',
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
      external: (id) => /\.test\.[tj]sx?$/.test(id) || id.includes('/__tests__/'),
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
        }
      }
    }
  }
});
