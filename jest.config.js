module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  setupFilesAfterEnv: ['<rootDir>/test-setup.js'],
  transformIgnorePatterns: [],
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', 'acceptance-tests', 'e2e'],
  moduleNameMapper: {
    '@siol-data/linkml-connector': require.resolve('@siol-data/linkml-connector')
  }
};
