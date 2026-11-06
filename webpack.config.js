const webpack = require('webpack');
const { version } = require('./package.json');

module.exports = {
  entry: './src/index.ts',
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: { configFile: 'tsconfig.webpack.json' },
        },
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [new webpack.DefinePlugin({ __GIST_VERSION__: JSON.stringify(version) })],
  watchOptions: {
    poll: 1000,
  },
  output: {
    library: 'Gist',
    libraryTarget: 'umd',
    libraryExport: 'default',
    filename: 'gist.js',
    globalObject: 'this',
  },
};
