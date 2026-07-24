import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

type ReleaseTarget = "linux-arm64" | "linux-x64" | "macos-universal";

const repositoryRoot = resolve(import.meta.dir, "..");
const whitespacePattern = /\s+/u;
const hostPackage = JSON.parse(
  readFileSync(join(repositoryRoot, "apps/host/package.json"), "utf8")
) as { readonly version: string };

const valueAfter = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
};

const target = (valueAfter("--target") ??
  (process.platform === "darwin"
    ? "macos-universal"
    : "linux-x64")) as ReleaseTarget;
const version = valueAfter("--version") ?? hostPackage.version;
const outputDirectory = resolve(
  valueAfter("--output") ?? join(repositoryRoot, "dist/host")
);
const signingIdentity = valueAfter("--sign-identity");
const notaryProfile = valueAfter("--notary-profile");
const supportedTargets = new Set<ReleaseTarget>([
  "linux-arm64",
  "linux-x64",
  "macos-universal",
]);

if (!supportedTargets.has(target)) {
  throw new Error(`Unsupported Host release target: ${target}`);
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) {
  throw new Error(`Invalid Host release version: ${version}`);
}
if (target === "macos-universal" && process.platform !== "darwin") {
  throw new Error("Build the universal macOS Host release on macOS");
}
if (notaryProfile && !signingIdentity) {
  throw new Error("Notarization requires --sign-identity");
}

const run = (
  executable: string,
  args: readonly string[],
  cwd = repositoryRoot
) => {
  const result = spawnSync(executable, [...args], {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `${[executable, ...args].join(" ")} exited ${result.status ?? 1}`
    );
  }
};

const stagingRoot = join(outputDirectory, ".staging", target);
const payloadRoot = join(stagingRoot, "vibepad-host");
const artifactBase = `vibepad-host-v${version}-${target}`;
rmSync(stagingRoot, { force: true, recursive: true });
mkdirSync(outputDirectory, { recursive: true });

const buildExecutable = (bunTarget: string, output: string) => {
  mkdirSync(dirname(output), { recursive: true });
  run("bun", [
    "build",
    "--compile",
    `--target=${bunTarget}`,
    "--no-compile-autoload-dotenv",
    "--no-compile-autoload-bunfig",
    "--no-compile-autoload-package-json",
    `--outfile=${output}`,
    "apps/host/src/cli.ts",
  ]);
  chmodSync(output, 0o755);
};

const copyBrowserAssets = (destination: string) => {
  cpSync(join(repositoryRoot, "apps/host/browser"), destination, {
    recursive: true,
  });
  chmodSync(destination, 0o755);
  chmodSync(join(destination, "chrome-entrypoint.sh"), 0o755);
  chmodSync(join(destination, "compose.yaml"), 0o644);
  chmodSync(join(destination, "surface-proxy.conf"), 0o644);
};

const writeMetadata = (directory: string) => {
  writeFileSync(
    join(directory, "release.json"),
    `${JSON.stringify(
      {
        bun: "1.3.14",
        target,
        version,
      },
      null,
      2
    )}\n`
  );
};

const writeChecksum = (artifactPath: string) => {
  const checksumPath = `${artifactPath}.sha256`;
  const result = spawnSync(
    process.platform === "darwin" ? "shasum" : "sha256sum",
    process.platform === "darwin"
      ? ["-a", "256", artifactPath]
      : [artifactPath],
    { encoding: "utf8" }
  );
  if (result.status !== 0 || !result.stdout) {
    throw new Error(`Unable to checksum ${artifactPath}`);
  }
  const [digest] = result.stdout.trim().split(whitespacePattern);
  if (!digest) {
    throw new Error(`Checksum output was empty for ${artifactPath}`);
  }
  writeFileSync(checksumPath, `${digest}  ${basename(artifactPath)}\n`);
};

let artifact: string;
if (target.startsWith("linux-")) {
  const architecture = target.slice("linux-".length);
  buildExecutable(
    `bun-linux-${architecture}`,
    join(payloadRoot, "bin/vibepad-host")
  );
  copyBrowserAssets(join(payloadRoot, "browser"));
  writeMetadata(payloadRoot);
  artifact = join(outputDirectory, `${artifactBase}.tar.gz`);
  rmSync(artifact, { force: true });
  run("tar", [
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-czf",
    artifact,
    "-C",
    stagingRoot,
    "vibepad-host",
  ]);
} else {
  const appRoot = join(stagingRoot, "VibePad Host.app");
  const contents = join(appRoot, "Contents");
  const executable = join(contents, "MacOS/vibepad-host");
  const armExecutable = join(stagingRoot, "vibepad-host-arm64");
  const x64Executable = join(stagingRoot, "vibepad-host-x64");
  buildExecutable("bun-darwin-arm64", armExecutable);
  buildExecutable("bun-darwin-x64", x64Executable);
  mkdirSync(dirname(executable), { recursive: true });
  run("lipo", ["-create", armExecutable, x64Executable, "-output", executable]);
  chmodSync(executable, 0o755);
  copyBrowserAssets(join(contents, "Resources/browser"));
  writeMetadata(contents);
  writeFileSync(
    join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key><string>VibePad Host</string>
  <key>CFBundleExecutable</key><string>vibepad-host</string>
  <key>CFBundleIdentifier</key><string>studio.peacockery.vibepad.host</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>VibePad Host</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>LSBackgroundOnly</key><true/>
</dict>
</plist>
`
  );
  if (signingIdentity) {
    run("codesign", [
      "--force",
      "--options",
      "runtime",
      "--sign",
      signingIdentity,
      "--timestamp",
      appRoot,
    ]);
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appRoot]);
  }
  artifact = join(outputDirectory, `${artifactBase}.zip`);
  rmSync(artifact, { force: true });
  run("ditto", ["-c", "-k", "--keepParent", appRoot, artifact]);
  if (notaryProfile) {
    run("xcrun", [
      "notarytool",
      "submit",
      artifact,
      "--keychain-profile",
      notaryProfile,
      "--wait",
    ]);
    run("xcrun", ["stapler", "staple", appRoot]);
    rmSync(artifact, { force: true });
    run("ditto", ["-c", "-k", "--keepParent", appRoot, artifact]);
  }
}

writeChecksum(artifact);
console.info(artifact);
