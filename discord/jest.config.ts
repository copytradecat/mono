import type { JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)\\.ts$': '$1',
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^@commands/(.*)$': '<rootDir>/commands/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json'
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(p-limit|yocto-queue)/.*)'
  ],
  moduleDirectories: ['node_modules', '<rootDir>'],
  roots: ['<rootDir>'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
};

export default config;