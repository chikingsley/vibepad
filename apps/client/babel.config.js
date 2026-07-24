/**
 * iOS and Android enable Worklets Bundle Mode, which react-native-streamdown
 * requires to run remend on a worklet thread. The preset's automatic worklets
 * plugin is disabled on those platforms so exactly one plugin instance runs
 * with the Bundle Mode options. Web keeps the stock preset behavior because
 * worklet runtimes (and the enriched native renderer) do not exist there.
 */
module.exports = (api) => {
  const platform = api.caller((caller) => caller?.platform);
  const useWorkletsBundleMode = platform === "android" || platform === "ios";

  return {
    presets: [
      [
        "babel-preset-expo",
        {
          jsxImportSource: "nativewind",
          ...(useWorkletsBundleMode
            ? { reanimated: false, worklets: false }
            : {}),
        },
      ],
      "nativewind/babel",
    ],
    ...(useWorkletsBundleMode
      ? {
          plugins: [
            [
              "react-native-worklets/plugin",
              { bundleMode: true, workletizableModules: ["remend"] },
            ],
          ],
        }
      : {}),
  };
};
