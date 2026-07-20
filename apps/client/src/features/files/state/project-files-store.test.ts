import type {
  WorkspaceFileChange,
  WorkspaceFileContent,
  WorkspaceFileNode,
} from "@vibepad/protocol/files";
import { describe, expect, it } from "vitest";

import { createFileNavigationStore } from "./file-navigation-store";
import { createProjectFilesStore } from "./project-files-store";

const change = (path: string, additions = 1): WorkspaceFileChange => ({
  additions,
  deletions: 0,
  path,
  status: "modified",
});

const node = (path: string): WorkspaceFileNode => ({
  ignored: false,
  name: path.split("/").at(-1) ?? path,
  path,
  type: "file",
});

const content = (value: string): WorkspaceFileContent => ({
  content: value,
  type: "text",
});

describe("Legend project files store", () => {
  it("reuses one ready change list across project surfaces", async () => {
    let loads = 0;
    const store = createProjectFilesStore({
      listFileChanges: (projectId) => {
        loads += 1;
        return Promise.resolve([change(`${projectId}/README.md`)]);
      },
      listFiles: () => Promise.resolve([]),
      readFile: () => Promise.resolve(content("")),
    });

    await store.loadChanges("project-a");
    await store.loadChanges("project-a");

    expect(loads).toBe(1);
    expect(store.state$.changesByProjectId["project-a"]?.peek()).toEqual({
      data: [change("project-a/README.md")],
      status: "ready",
    });
  });

  it("keeps directory and project subscriptions isolated", async () => {
    const store = createProjectFilesStore({
      listFileChanges: () => Promise.resolve([]),
      listFiles: (_projectId, path) =>
        Promise.resolve([node(`${path}file.ts`)]),
      readFile: () => Promise.resolve(content("")),
    });
    await store.loadDirectory("project-a", "src/");
    await store.loadDirectory("project-b", "docs/");
    const projectB$ = store.state$.directoriesByProjectId["project-b"];
    if (!projectB$) {
      throw new Error("Expected a project-b directory registry");
    }
    let projectBNotifications = 0;
    const dispose = projectB$.onChange(() => {
      projectBNotifications += 1;
    });

    await store.loadDirectory("project-a", "tests/");

    expect(projectBNotifications).toBe(0);
    expect(
      store.state$.directoriesByProjectId["project-a"]?.["tests/"]?.peek()
    ).toEqual({ data: [node("tests/file.ts")], status: "ready" });
    dispose();
  });

  it("rejects a late stale refresh and caches file contents", async () => {
    const releases: Array<(value: readonly WorkspaceFileChange[]) => void> = [];
    let contentLoads = 0;
    const store = createProjectFilesStore({
      listFileChanges: () =>
        new Promise((resolve) => {
          releases.push(resolve);
        }),
      listFiles: () => Promise.resolve([]),
      readFile: (_projectId, path) => {
        contentLoads += 1;
        return Promise.resolve(content(path));
      },
    });

    const first = store.loadChanges("project-a");
    const second = store.loadChanges("project-a", true);
    releases[1]?.([change("new.ts", 2)]);
    await second;
    releases[0]?.([change("old.ts")]);
    await first;
    await store.loadContent("project-a", "src/index.ts");
    await store.loadContent("project-a", "src/index.ts");

    expect(store.state$.changesByProjectId["project-a"]?.peek()).toEqual({
      data: [change("new.ts", 2)],
      status: "ready",
    });
    expect(contentLoads).toBe(1);
    expect(
      store.state$.contentsByProjectId["project-a"]?.["src/index.ts"]?.peek()
    ).toEqual({ data: content("src/index.ts"), status: "ready" });
  });
});

describe("Legend file navigation store", () => {
  it("preserves additive tabs and isolates sessions", () => {
    const store = createFileNavigationStore();
    store.openFile("session-a", "src/a.ts", false);
    store.openFile("session-a", "src/b.ts", true);
    store.openFile("session-b", "README.md", false);
    const sessionB$ = store.state$.bySessionId["session-b"];
    if (!sessionB$) {
      throw new Error("Expected session-b navigation state");
    }
    let sessionBNotifications = 0;
    const dispose = sessionB$.onChange(() => {
      sessionBNotifications += 1;
    });

    store.closeFile("session-a", "src/b.ts");

    expect(store.state$.bySessionId["session-a"]?.peek()).toEqual({
      currentPath: "",
      openFiles: ["src/a.ts"],
      selectedChange: undefined,
      selectedFile: "src/a.ts",
    });
    expect(sessionBNotifications).toBe(0);
    dispose();
  });
});
