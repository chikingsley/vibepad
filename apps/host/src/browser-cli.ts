import { VibePadBrowserRuntime } from "./browser-runtime";

const usage = `VibePad Browser

Usage:
  bun run --filter @vibepad/host browser install
  bun run --filter @vibepad/host browser start
  bun run --filter @vibepad/host browser status
  bun run --filter @vibepad/host browser stop
`;

const main = async () => {
  const [command] = process.argv.slice(2);
  const runtime = new VibePadBrowserRuntime();
  if (!command || command === "help" || command === "--help") {
    console.info(usage);
    return;
  }
  if (command === "install") {
    console.info(JSON.stringify(await runtime.install(), null, 2));
    return;
  }
  if (command === "start") {
    await runtime.start();
    console.info(JSON.stringify(await runtime.status(), null, 2));
    return;
  }
  if (command === "status") {
    console.info(JSON.stringify(await runtime.status(), null, 2));
    return;
  }
  if (command === "stop") {
    await runtime.stop();
    console.info(JSON.stringify(await runtime.status(), null, 2));
    return;
  }
  throw new Error(`Unknown browser command: ${command}\n\n${usage}`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
