import {
  type CapabilityId,
  type CapabilitySupport,
  providerManifestSchema,
} from "@vibepad/protocol/capabilities";
import type { HarnessAdapter } from "@vibepad/protocol/provider";

const supported = { state: "supported" } as const satisfies CapabilitySupport;
const unsupported = (note: string): CapabilitySupport => ({
  note,
  state: "unsupported",
});

export const openCodeCapabilityOperations = {
  "file.read": "readFile",
  "file.status": "listFileChanges",
  "model.select": "selectModel",
  "permission.respond": "respondPermission",
  "project.list": "listProjects",
  "question.respond": "respondQuestion",
  "session.archive": "archiveSession",
  "session.create": "createSession",
  "session.list": "listSessions",
  "session.rename": "renameSession",
  "session.resume": "listTimeline",
  "timeline.stream": "subscribe",
  "turn.cancel": "abortTurn",
  "turn.send": "sendTurn",
} as const satisfies Partial<Record<CapabilityId, keyof HarnessAdapter>>;

const capabilities = {
  "command.run": unsupported(
    "The OpenCode SDK exposes commands, but the VibePad adapter has no command operation yet."
  ),
  "file.read": supported,
  "file.search": unsupported(
    "The VibePad adapter does not yet project OpenCode file or symbol search."
  ),
  "file.status": supported,
  "model.select": supported,
  "permission.respond": supported,
  "project.list": {
    note: "Uses the generated project endpoint until project discovery is available under OpenCode v2.",
    state: "conditional",
  },
  "question.respond": supported,
  "session.archive": {
    note: "OpenCode archives durably by timestamp; the current API does not support clearing that timestamp.",
    state: "conditional",
  },
  "session.children": unsupported(
    "Child sessions are filtered from root inventory until their product surface is implemented."
  ),
  "session.create": supported,
  "session.list": supported,
  "session.rename": {
    note: "Uses OpenCode's generated session update endpoint until title updates are available under v2.",
    state: "conditional",
  },
  "session.resume": {
    note: "OpenCode sessions are persistent; resume loads the existing session and timeline.",
    state: "conditional",
  },
  "session.share": unsupported(
    "Session sharing and its remote-exposure semantics are not implemented."
  ),
  "shell.run": unsupported(
    "Shell messages can be projected in timelines, but VibePad cannot start a shell operation."
  ),
  "timeline.stream": supported,
  "turn.cancel": supported,
  "turn.revert": unsupported(
    "Revert and unrevert controls are not implemented by the adapter."
  ),
  "turn.send": supported,
} satisfies Record<CapabilityId, CapabilitySupport>;

export const openCodeManifest = providerManifestSchema.parse({
  capabilities,
  controls: [
    {
      id: "agent.select",
      kind: "select",
      label: "Agent",
      scope: "session",
    },
  ],
  displayName: "OpenCode",
  id: "opencode",
  protocolVersion: 1,
});
