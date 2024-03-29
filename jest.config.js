/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  verbose: true,
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  transform: {
    // '^.+\\.(t)s$': 'ts-jest',
    // '^.+\\.(j)s$': 'babel-jest',
  },
  // resolver: '<rootDir>/jest-resolver.cjs',
  transformIgnorePatterns: [
  ],
  modulePathIgnorePatterns: ['<rootDir>/build/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.+)\\.js$': '$1',
  }
};
