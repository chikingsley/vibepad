const appAttestEnvironment = process.env.VIBEPAD_APP_ATTEST_ENVIRONMENT;
const appAttestEntitlements =
  appAttestEnvironment === "development" ||
  appAttestEnvironment === "production"
    ? {
        "com.apple.developer.devicecheck.appattest-environment":
          appAttestEnvironment,
      }
    : {};

module.exports = ({ config }) => ({
  ...config,
  extra: {
    eas: {
      projectId: "7f92ffef-93fd-4be7-9190-1d3ff0147e93",
    },
  },
  ios: {
    ...config.ios,
    entitlements: {
      ...config.ios?.entitlements,
      ...appAttestEntitlements,
    },
    infoPlist: {
      ...config.ios?.infoPlist,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  owner: "peacockery-studio",
});
