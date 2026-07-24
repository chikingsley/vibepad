import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
  listAgyConversationWorkspaces,
  readAgyConversationId,
} from "./conversation-cache";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "agy-cache-"));
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

const writeCache = async (cache: unknown) => {
  const path = join(directory, "last_conversations.json");
  await writeFile(path, JSON.stringify(cache));
  return path;
};

it("returns the conversation id recorded for a cwd", async () => {
  const path = await writeCache({ "/work": "cid-1" });
  expect(readAgyConversationId("/work", path)).toBe("cid-1");
});

it("falls back to the realpath of the cwd", async () => {
  const link = join(directory, "link");
  const created = join(directory, "workspace");
  await mkdir(created);
  const realDirectory = await realpath(created);
  await symlink(created, link);
  const path = await writeCache({ [realDirectory]: "cid-real" });
  expect(readAgyConversationId(link, path)).toBe("cid-real");
});

it("returns null when the cache file is missing", () => {
  expect(
    readAgyConversationId("/work", join(directory, "missing.json"))
  ).toBeNull();
});

it("returns null for malformed or non-object caches", async () => {
  const broken = join(directory, "broken.json");
  await writeFile(broken, "{not json");
  expect(readAgyConversationId("/work", broken)).toBeNull();
  const array = await writeCache(["cid"]);
  expect(readAgyConversationId("/work", array)).toBeNull();
});

it("returns null when the cwd has no entry or a non-string entry", async () => {
  const path = await writeCache({ "/other": "cid-1", "/work": 42 });
  expect(readAgyConversationId("/work", path)).toBeNull();
});

it("lists every workspace with a recorded conversation", async () => {
  const path = await writeCache({ "/a": "cid-a", "/b": "cid-b", "/c": 7 });
  expect(listAgyConversationWorkspaces(path)).toEqual([
    ["/a", "cid-a"],
    ["/b", "cid-b"],
  ]);
});

it("lists nothing when the cache is missing", () => {
  expect(listAgyConversationWorkspaces(join(directory, "nope.json"))).toEqual(
    []
  );
});
