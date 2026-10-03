module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  // Runs before any test module is imported, so the LDP discovery suite can
  // require web/app.js without the Shopify API client throwing. See
  // web/jest-ldp-env.js.
  setupFiles: ['<rootDir>/web/jest-ldp-env.js'],
  setupFilesAfterEnv: ['<rootDir>/test-setup.js'],
  transformIgnorePatterns: [],
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', 'acceptance-tests', 'e2e'],
  moduleNameMapper: {
    '@siol-data/linkml-connector': require.resolve('@siol-data/linkml-connector')
  }
};
