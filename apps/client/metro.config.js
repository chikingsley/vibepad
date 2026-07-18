const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// biome-ignore lint/correctness/noGlobalDirnameFilename: Expo loads metro.config.js as CommonJS.
const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

module.exports = withNativeWind(config, {
  inlineRem: 16,
  input: "./src/global.css",
});
