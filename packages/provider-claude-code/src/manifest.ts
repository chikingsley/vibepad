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

export const claudeCodeCapabilityOperations = {
  "file.read": "readFile",
  "model.select": "selectModel",
  "permission.respond": "respondPermission",
  "project.list": "listProjects",
  "question.respond": "respondQuestion",
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
    "Claude Code slash commands are not projected through the shared adapter yet."
  ),
  "file.read": {
    note: "Reads project files directly from the host filesystem, scoped to the project root.",
    state: "conditional",
  },
  "file.search": unsupported(
    "Claude Code exposes no file search endpoint the host can call without running a turn."
  ),
  "file.status": unsupported(
    "Claude Code has no diff service; VibePad has not projected a host-side git diff for it."
  ),
  "model.select": {
    note: "Static Anthropic model aliases; applied live via the Agent SDK or at the next session launch.",
    state: "conditional",
  },
  "permission.respond": supported,
  "project.list": {
    note: "Projects are derived from session working directories plus configured host roots.",
    state: "conditional",
  },
  "question.respond": {
    note: "AskUserQuestion tool prompts are projected as questions; answers are returned as edited tool input.",
    state: "conditional",
  },
  "session.archive": unsupported(
    "Claude Code only supports destructive session deletion; VibePad does not archive by deleting."
  ),
  "session.children": unsupported(
    "Subagent transcripts exist on disk, but the VibePad child-session surface is not implemented."
  ),
  "session.create": supported,
  "session.list": supported,
  "session.rename": supported,
  "session.resume": supported,
  "session.share": unsupported(
    "Claude Code session sharing is not part of the VibePad host contract."
  ),
  "shell.run": unsupported(
    "Bash tool calls render as shell timeline parts, but VibePad cannot start a shell directly."
  ),
  "timeline.stream": supported,
  "turn.cancel": supported,
  "turn.revert": unsupported(
    "Claude Code file checkpointing exists, but the VibePad revert contract is not implemented."
  ),
  "turn.send": supported,
} satisfies Record<CapabilityId, CapabilitySupport>;

export const claudeCodeManifest = providerManifestSchema.parse({
  capabilities,
  controls: [
    {
      id: "permission-mode.select",
      kind: "select",
      label: "Mode",
      scope: "session",
    },
  ],
  displayName: "Claude Code",
  id: "claude-code",
  protocolVersion: 1,
});
