module.exports = {
  collectCoverageFrom: ['src/**/*.ts'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^{{name}}$': '<rootDir>/src/index.ts',
  },
  transform: {
    '\\.tsx?$': ['esbuild-jest', { sourcemap: true }],
  },
}
