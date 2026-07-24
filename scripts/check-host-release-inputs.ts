import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const requiredFiles = [
  "apps/host/browser/chrome-entrypoint.sh",
  "apps/host/browser/compose.yaml",
  "apps/host/browser/surface-proxy.conf",
  "packages/peacockery-voice-client/dist/index.d.ts",
  "packages/peacockery-voice-client/dist/index.js",
  "packages/peacockery-voice-client/dist/schema.d.ts",
  "packages/peacockery-voice-client/dist/schema.js",
  "scripts/install-host.sh",
] as const;

const missing = (
  await Promise.all(
    requiredFiles.map(async (relativePath) => {
      try {
        const file = await stat(join(repositoryRoot, relativePath));
        return file.isFile() && file.size > 0 ? undefined : relativePath;
      } catch {
        return relativePath;
      }
    })
  )
).filter((path): path is (typeof requiredFiles)[number] => Boolean(path));

if (missing.length > 0) {
  throw new Error(
    `VibePad Host release inputs are missing or empty:\n${missing.map((path) => `- ${path}`).join("\n")}`
  );
}

console.info("VibePad Host release inputs are present.");
