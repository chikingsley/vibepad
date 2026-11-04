import { expect, it as test } from "vitest";

import { detectClaudeCode } from "./detect";

const probes = (existing: readonly string[]) => ({
  fileExists: (path: string) => existing.includes(path),
  readTextFile: () => undefined,
  resolveRealPath: (path: string) => path,
});

test("finds the claude binary on PATH without invoking it", () => {
  const detection = detectClaudeCode({
    env: { PATH: "/usr/bin:/home/simon/.local/bin" },
    homeDirectory: "/home/simon",
    ...probes(["/home/simon/.local/bin/claude"]),
  });

  expect(detection).toMatchObject({
    available: true,
    executablePath: "/home/simon/.local/bin/claude",
    source: "path",
  });
});

test("falls back to known install locations when PATH has no claude", () => {
  const detection = detectClaudeCode({
    env: { PATH: "/usr/bin" },
    homeDirectory: "/home/simon",
    ...probes(["/home/simon/.claude/local/claude"]),
  });

  expect(detection).toMatchObject({
    available: true,
    executablePath: "/home/simon/.claude/local/claude",
    source: "known-path",
  });
});

test("prefers a configured executable and reports absence honestly", () => {
  const configured = detectClaudeCode({
    env: { PATH: "/usr/bin" },
    executable: "/opt/tools/claude",
    homeDirectory: "/home/simon",
    ...probes(["/opt/tools/claude"]),
  });
  const missing = detectClaudeCode({
    env: { PATH: "/usr/bin" },
    executable: "/opt/tools/claude",
    homeDirectory: "/home/simon",
    ...probes([]),
  });

  expect(configured).toMatchObject({
    available: true,
    executablePath: "/opt/tools/claude",
    source: "configured",
  });
  expect(missing).toEqual({ available: false, source: "none" });
});

test("reads the version from native-installer version directories", () => {
  const detection = detectClaudeCode({
    env: { PATH: "/home/simon/.local/bin" },
    fileExists: (path) => path === "/home/simon/.local/bin/claude",
    homeDirectory: "/home/simon",
    readTextFile: () => undefined,
    resolveRealPath: () =>
      "/home/simon/.local/share/claude/versions/2.1.218/claude",
  });

  expect(detection.version).toBe("2.1.218");
});

test("reads the version from the npm package manifest next to the real binary", () => {
  const packageJson =
    "/opt/node_modules/@anthropic-ai/claude-code/package.json";
  const detection = detectClaudeCode({
    env: { PATH: "/usr/local/bin" },
    fileExists: (path) => path === "/usr/local/bin/claude",
    homeDirectory: "/home/simon",
    readTextFile: (path) =>
      path === packageJson
        ? JSON.stringify({
            name: "@anthropic-ai/claude-code",
            version: "2.1.0",
          })
        : undefined,
    resolveRealPath: () => "/opt/node_modules/@anthropic-ai/claude-code/cli.js",
  });

  expect(detection.version).toBe("2.1.0");
});

test("reports nothing found on a machine without Claude Code", () => {
  const detection = detectClaudeCode({
    env: { PATH: "/usr/bin:/usr/local/bin" },
    homeDirectory: "/home/simon",
    ...probes([]),
  });

  expect(detection).toEqual({ available: false, source: "none" });
});
