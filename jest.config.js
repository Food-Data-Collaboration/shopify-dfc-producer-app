module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  setupFiles: ['<rootDir>/test-env.js'],
  setupFilesAfterEnv: ['<rootDir>/test-setup.js'],
  transformIgnorePatterns: [],
  testEnvironment: 'node',
  moduleNameMapper: {
    '@fooddatacollaboration/linkml-connector': require.resolve(
      '@fooddatacollaboration/linkml-connector'
    )
  }
};
