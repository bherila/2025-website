const sourceMaps = process.env.JEST_INLINE_SOURCEMAPS === '1' ? 'inline' : false;
const slowTestPathIgnorePatterns = process.env.JEST_INCLUDE_SLOW_TESTS === '1'
  ? []
  : ['\\.slow\\.test\\.[tj]sx?$'];
const gameTestPathIgnorePatterns = process.env.JEST_EXCLUDE_GAME_TESTS === '1'
  ? ['/resources/js/games/cars/', '/resources/js/games/marble-sort/']
  : [];
const defaultTestPathIgnorePatterns = [
  ...slowTestPathIgnorePatterns,
  ...gameTestPathIgnorePatterns,
];

const shared = {
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/resources/js/$1',
    '^@toon-format/toon$': '<rootDir>/resources/js/__mocks__/toon.ts',
    '\\.(css|less|scss|sass)$': '<rootDir>/resources/js/__mocks__/styleMock.ts',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!.*(?:dayjs|three)[@/]).+\\.js$',
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
        '<rootDir>/resources/js/**/*.dom.test.ts',
        '<rootDir>/tests-ts/**/*.dom.test.ts',
      ],
      testPathIgnorePatterns: defaultTestPathIgnorePatterns,
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
      testPathIgnorePatterns: [
        '\\.dom\\.test\\.ts$',
        ...defaultTestPathIgnorePatterns,
      ],
      setupFilesAfterEnv: ['<rootDir>/tests-ts/jest.setup.node.ts'],
      ...shared,
    },
  ],
};
