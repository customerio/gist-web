module.exports = {
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [{ test: /\.ts$/, use: "ts-loader", exclude: /node_modules/ }],
  },
  watchOptions: {
    poll: 1000,
  },
  output: {
    library: "Gist",
    libraryTarget: "umd",
    libraryExport: "default",
    filename: "gist.js",
    globalObject: "this",
  },
};
