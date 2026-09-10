import type { Config } from 'jest';

/** Unit + integration. E2E and the isolation gate have their own configs. */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  /* scripts/ too: the import tooling is code that ships behaviour, and the
     helper that survives dropped connections had an untested hole in it. */
  testRegex: '(src|scripts)/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};

export default config;
