const TsCheckerPlugin = require("../../lib/index.js").default;

module.exports = {
  entry: `${__dirname}/src/main.ts`,
  output: {
    path: `${__dirname}/dist`
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: "ts-loader",
            options: {
              transpileOnly: true
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new TsCheckerPlugin()
  ]
};
