// Only for Jest: it cannot load ES modules, so babel-jest turns the Evolution SDK and the ES
// modules it depends on into CommonJS while testing (see "jest" in package.json). The API itself
// loads them with Node's require() and is never run through Babel.
module.exports = { presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]] };
