import type { Config } from 'jest';

/**
 * The cross-tenant gate. Separate config so CI can require it independently
 * and so it always runs serially against a real database — RLS is a database
 * feature and a mock cannot prove it.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/isolation/.*\\.isolation-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  setupFiles: ['<rootDir>/test/helpers/load-test-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/helpers/close-connections.ts'],
  testTimeout: 30_000,
  /* An empty gate would pass, which is the one result it must never give. */
  passWithNoTests: false,
};

export default config;
