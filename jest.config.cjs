const sourceMaps = process.env.CI === 'true' ? 'inline' : false;

const domTsTests = [
  '<rootDir>/resources/js/components/finance/tax-preview/__tests__/useTaxPreviewPrefs.test.ts',
  '<rootDir>/resources/js/components/finance/transactionTable/__tests__/transactionExport.test.ts',
  '<rootDir>/resources/js/components/finance/transactionTable/__tests__/useColumnVisibility.test.ts',
  '<rootDir>/resources/js/components/finance/transactionTable/__tests__/useKeyboardNavigation.test.ts',
  '<rootDir>/resources/js/components/finance/transactionTable/__tests__/useRowSelection.test.ts',
  '<rootDir>/resources/js/components/finance/transactionTable/__tests__/useTransactionFilters.test.ts',
  '<rootDir>/resources/js/components/markdown/__tests__/printExport.test.ts',
  '<rootDir>/resources/js/components/markdown/__tests__/sanitizeSvg.test.ts',
  '<rootDir>/resources/js/games/cars/__tests__/gameEngine.test.ts',
  '<rootDir>/resources/js/games/cars/__tests__/gameProgress.test.ts',
  '<rootDir>/resources/js/games/marble-sort/__tests__/gameEngine.test.ts',
  '<rootDir>/resources/js/games/marble-sort/__tests__/gameProgress.test.ts',
  '<rootDir>/resources/js/genai-processor/__tests__/useGenAiFileUpload.test.ts',
  '<rootDir>/resources/js/genai-processor/__tests__/useGenAiJobPolling.test.ts',
  '<rootDir>/tests-ts/webauthn-utils.test.ts',
];

const shared = {
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/resources/js/$1',
    '^@toon-format/toon$': '<rootDir>/resources/js/__mocks__/toon.ts',
    '\\.(css|less|scss|sass)$': '<rootDir>/resources/js/__mocks__/styleMock.ts',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!dayjs).+\\.js$',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', tsx: true, decorators: true },
        transform: { react: { runtime: 'automatic' } },
        target: 'es2022',
      },
      sourceMaps,
    }],
    '^.+\\.(js|jsx|mjs|cjs)$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'ecmascript', jsx: true },
        transform: { react: { runtime: 'automatic' } },
        target: 'es2022',
      },
      sourceMaps,
    }],
  },
};

module.exports = {
  projects: [
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/resources/js/**/*.test.tsx',
        '<rootDir>/tests-ts/**/*.test.tsx',
        ...domTsTests,
      ],
      setupFilesAfterEnv: ['<rootDir>/tests-ts/jest.setup.ts'],
      ...shared,
    },
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/resources/js/**/*.test.ts',
        '<rootDir>/tests-ts/**/*.test.ts',
      ],
      testPathIgnorePatterns: domTsTests,
      setupFilesAfterEnv: ['<rootDir>/tests-ts/jest.setup.node.ts'],
      ...shared,
    },
  ],
};
