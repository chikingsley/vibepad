import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const clientRoot = resolve(repositoryRoot, "apps/client");
const nativeSources = [
  "apps/client/modules/vibepad-secure-signer/ios/VibePadSecureSigner.podspec",
  "apps/client/modules/vibepad-secure-signer/ios/VibePadSecureSignerModule.swift",
] as const;

const trackedSources = spawnSync(
  "git",
  ["ls-files", "--error-unmatch", ...nativeSources],
  { cwd: repositoryRoot, encoding: "utf8" }
);
if (trackedSources.status !== 0) {
  throw new Error(
    "The VibePad Secure Signer native sources must be tracked in Git for EAS builds."
  );
}

const autolinking = spawnSync(
  "bunx",
  ["expo-modules-autolinking", "resolve", "--platform", "apple", "--json"],
  {
    cwd: clientRoot,
    encoding: "utf8",
  }
);
if (autolinking.status !== 0) {
  throw new Error(autolinking.stderr);
}

const resolution = JSON.parse(autolinking.stdout) as {
  readonly modules?: readonly {
    readonly modules?: readonly { readonly class?: string }[];
    readonly packageName?: string;
    readonly pods?: readonly { readonly podName?: string }[];
  }[];
};
const secureSigner = resolution.modules?.find(
  ({ packageName }) => packageName === "vibepad-secure-signer"
);
const resolvesPod = secureSigner?.pods?.some(
  ({ podName }) => podName === "VibePadSecureSigner"
);
const resolvesModule = secureSigner?.modules?.some(
  (module) => module.class === "VibePadSecureSignerModule"
);

if (!(resolvesPod && resolvesModule)) {
  throw new Error(
    "Expo Apple autolinking must resolve the VibePadSecureSigner pod and module."
  );
}

console.log(
  "VibePadSecureSigner is tracked and available to Expo Apple autolinking."
);
