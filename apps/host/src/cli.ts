const [command, ...args] = process.argv.slice(2);

const run = async () => {
  if (command === "serve") {
    await import("./index");
    return;
  }
  if (command === "setup") {
    process.argv = [process.argv[0] ?? "vibepad-host", "setup", ...args];
    const { VIBEPAD_HOST_EXECUTABLE } = process.env;
    Object.assign(process.env, {
      VIBEPAD_HOST_EXECUTABLE: VIBEPAD_HOST_EXECUTABLE ?? process.execPath,
    });
    await import("./bootstrap-cli");
    return;
  }
  console.info(`VibePad Host

Usage:
  vibepad-host setup [options]
  vibepad-host serve

Run "vibepad-host setup --help" for setup options.`);
  process.exitCode = command && command !== "--help" ? 2 : 0;
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
