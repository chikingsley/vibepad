/**
 * Capability manifest for the Antigravity (`agy`) provider.
 *
 * agy exposes no streaming-event protocol: its only non-interactive surface
 * is one `agy --print` process per turn, plain text on stdout, governed by
 * CLI flags plus agy's own settings.json
 * (happy-cli/src/agy/AgyBackend.ts:1-16, cliArgs.ts:11-16). The capability
 * states below follow directly from that.
 */

import {
  type CapabilityId,
  type CapabilitySupport,
  providerManifestSchema,
} from "@vibepad/protocol/capabilities";
import type { HarnessAdapter } from "@vibepad/protocol/provider";

const supported = { state: "supported" } as const satisfies CapabilitySupport;
const conditional = (note: string): CapabilitySupport => ({
  note,
  state: "conditional",
});
const unsupported = (note: string): CapabilitySupport => ({
  note,
  state: "unsupported",
});

export const agyCapabilityOperations = {
  "file.read": "readFile",
  "model.select": "selectModel",
  "project.list": "listProjects",
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
    "agy print mode is a single opaque process per turn; no command lifecycle is exposed."
  ),
  "file.read": supported,
  "file.search": unsupported("agy exposes no file-search surface."),
  "file.status": unsupported(
    "agy exposes no change tracking; print mode reports only final prose."
  ),
  "model.select": conditional(
    "Static model list recorded from `agy models`; applied per turn via --model."
  ),
  "permission.respond": unsupported(
    "agy --print is one-shot and cannot surface approval prompts; approvals are governed by --sandbox or --dangerously-skip-permissions plus agy's settings.json."
  ),
  "project.list": conditional(
    "Projects are derived from configured host roots plus agy's per-workspace conversation cache."
  ),
  "question.respond": unsupported(
    "agy print mode has no interactive question protocol."
  ),
  "session.archive": conditional(
    "Removes the session from VibePad only; agy keeps its conversation store."
  ),
  "session.children": unsupported("agy has no child-conversation surface."),
  "session.create": supported,
  "session.list": conditional(
    "Lists VibePad-created sessions plus the last agy conversation per workspace from the cwd cache; agy exposes no full conversation listing."
  ),
  "session.rename": conditional(
    "Titles are VibePad-local; agy has no rename surface."
  ),
  "session.resume": conditional(
    "Resumes via --conversation with the cached id; visible history is limited to turns recorded through VibePad."
  ),
  "session.share": unsupported("agy has no sharing surface."),
  "shell.run": unsupported("agy print mode exposes no shell lifecycle."),
  "timeline.stream": supported,
  "turn.cancel": supported,
  "turn.revert": unsupported("agy exposes no revert surface."),
  "turn.send": supported,
} satisfies Record<CapabilityId, CapabilitySupport>;

export const agyManifest = providerManifestSchema.parse({
  capabilities,
  controls: [
    {
      id: "approval-policy.select",
      kind: "select",
      label: "Approvals",
      scope: "session",
    },
  ],
  displayName: "Antigravity",
  id: "agy",
  protocolVersion: 1,
});
