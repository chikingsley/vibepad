const appJson = require("./app.json");

const appAttestEnvironment =
  process.env.VIBEPAD_APP_ATTEST_ENVIRONMENT === "production"
    ? "production"
    : "development";

module.exports = {
  ...appJson.expo,
  extra: {
    eas: {
      projectId: "7f92ffef-93fd-4be7-9190-1d3ff0147e93",
    },
  },
  ios: {
    ...appJson.expo.ios,
    entitlements: {
      ...appJson.expo.ios.entitlements,
      "com.apple.developer.devicecheck.appattest-environment":
        appAttestEnvironment,
    },
    infoPlist: {
      ...appJson.expo.ios.infoPlist,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  owner: "peacockery-studio",
};
