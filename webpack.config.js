module.exports = {
  watchOptions: {
    poll: 1000
  },
  output: {
    library: 'Gist',
    libraryTarget: 'umd',
    filename: 'gist.js',
    globalObject: 'this'
  }
};