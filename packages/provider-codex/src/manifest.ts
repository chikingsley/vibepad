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

export const codexCapabilityOperations = {
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
    "Codex app-server exposes command execution, but VibePad has not projected its terminal lifecycle yet."
  ),
  "file.read": supported,
  "file.search": unsupported(
    "Codex fuzzy file search is not yet projected through the shared adapter."
  ),
  "file.status": {
    note: "Uses Codex app-server's git diff against the repository remote.",
    state: "conditional",
  },
  "model.select": supported,
  "permission.respond": supported,
  "project.list": {
    note: "Projects are derived from root-thread working directories plus configured host roots.",
    state: "conditional",
  },
  "question.respond": supported,
  "session.archive": supported,
  "session.children": unsupported(
    "Codex exposes parent and descendant thread identities, but the VibePad child-session operation is not implemented."
  ),
  "session.create": supported,
  "session.list": supported,
  "session.rename": supported,
  "session.resume": supported,
  "session.share": unsupported(
    "Codex remote control is intentionally separate from VibePad host pairing."
  ),
  "shell.run": unsupported(
    "Shell items render in timelines, but the shared shell-start operation is not implemented."
  ),
  "timeline.stream": supported,
  "turn.cancel": supported,
  "turn.revert": unsupported(
    "Codex rollback exists, but the VibePad revert contract and confirmation UI are not implemented."
  ),
  "turn.send": supported,
} satisfies Record<CapabilityId, CapabilitySupport>;

export const codexManifest = providerManifestSchema.parse({
  capabilities,
  controls: [
    {
      id: "collaboration-mode.select",
      kind: "select",
      label: "Mode",
      scope: "session",
    },
  ],
  displayName: "Codex",
  id: "codex",
  protocolVersion: 1,
});
