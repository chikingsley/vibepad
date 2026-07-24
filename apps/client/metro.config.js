const { mkdirSync } = require("node:fs");
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const {
  getBundleModeMetroConfig,
} = require("react-native-worklets/bundleMode");

// biome-ignore lint/correctness/noGlobalDirnameFilename: Expo loads metro.config.js as CommonJS.
const projectRoot = __dirname;
let config = getDefaultConfig(projectRoot);

// Worklets Bundle Mode generates worklet modules into this directory on the
// fly; Metro must watch it. The path is resolved through the package because
// this workspace hoists node_modules to the repository root.
const workletsOutputDir = path.join(
  path.dirname(require.resolve("react-native-worklets/package.json")),
  ".worklets"
);
mkdirSync(workletsOutputDir, { recursive: true });
config.watchFolders = [...config.watchFolders, workletsOutputDir];

const expoResolveRequest = config.resolver.resolveRequest;
const expoGetTransformOptions = config.transformer.getTransformOptions;

config = getBundleModeMetroConfig(config);

const bundleModeResolveRequest = config.resolver.resolveRequest;
const bundleModeGetTransformOptions = config.transformer.getTransformOptions;

// Route only generated Bundle Mode modules through the Bundle Mode resolver.
// Every other request keeps the Expo chain, so web resolution (including the
// react-native-web alias) is unchanged.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("react-native-worklets/.worklets/")) {
    return bundleModeResolveRequest(context, moduleName, platform);
  }
  if (expoResolveRequest) {
    return expoResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Bundle Mode forces inlineRequires for the worklet runtime bundle; keep the
// stock Expo transform options for web.
config.transformer.getTransformOptions = (entryPoints, options, ...rest) =>
  options.platform === "web"
    ? expoGetTransformOptions(entryPoints, options, ...rest)
    : bundleModeGetTransformOptions(entryPoints, options, ...rest);

module.exports = withNativeWind(config, {
  inlineRem: 16,
  input: "./src/global.css",
});
