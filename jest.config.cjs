/** @type {import('@jest/types').Config.InitialOptions} */
const config = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/resources/js/**/*.test.ts?(x)', '<rootDir>/tests-ts/**/*.test.ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/tests-ts/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/resources/js/$1',
    '^@toon-format/toon$': '<rootDir>/resources/js/__mocks__/toon.ts',
    '^pdfjs-dist$': '<rootDir>/resources/js/__mocks__/pdfjs-dist.ts',
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
      sourceMaps: 'inline',
    }],
    '^.+\\.(js|jsx|mjs|cjs)$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'ecmascript', jsx: true },
        transform: { react: { runtime: 'automatic' } },
        target: 'es2022',
      },
      sourceMaps: 'inline',
    }],
  },
};

module.exports = config;
