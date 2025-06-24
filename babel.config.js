module.exports = {
  presets: [ ['@babel/preset-env', {
    targets: { node: '20' },
    bugfixes: true,
  }], '@babel/preset-typescript'],
  plugins: [
    ['@babel/plugin-syntax-import-attributes', { deprecatedAssertSyntax: true }]
  ]
};
