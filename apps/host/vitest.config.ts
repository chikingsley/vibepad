import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several suites drive real Chromium processes over CDP. Launching them
    // in parallel starves the DevTools handshakes on a busy machine, so host
    // test files run sequentially.
    fileParallelism: false,
  },
});
