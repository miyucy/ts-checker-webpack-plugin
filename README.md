# ts-checker-webpack-plugin

## Usage

```bash
yarn add @miyucy/ts-checker-webpack-plugin
```

```js
const TsCheckerPlugin = require("@miyucy/ts-checker-webpack-plugin").default;

module.exports = {
  // :
  module: {
    rules: [
      {
        test: /\.tsx?$/,
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
  }
  // :
  plugins: [
    new TsCheckerPlugin()
  ]
};
```

## Examples

```bash
git clone [this repo]
cd [repo]
yarn install
yarn build

cd examples/prj1
yarn install
yarn build
```
