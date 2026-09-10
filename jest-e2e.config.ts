import type { Config } from 'jest';

/** Supertest against the real Nest app and a real Postgres. */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/e2e/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  /* A throwaway Postgres per run: no Docker, never the database in .env. */
  globalSetup: '<rootDir>/test/helpers/global-setup.ts',
  globalTeardown: '<rootDir>/test/helpers/global-teardown.ts',
  setupFiles: ['<rootDir>/test/helpers/load-test-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/helpers/close-connections.ts'],
  testTimeout: 30_000,
};

export default config;
