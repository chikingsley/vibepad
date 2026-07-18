import {
  type CapabilityId,
  type CapabilitySupport,
  providerManifestSchema,
} from "@vibepad/protocol/capabilities";

const supported = { state: "supported" } as const satisfies CapabilitySupport;

const capabilities = {
  "command.run": supported,
  "file.read": supported,
  "file.search": supported,
  "file.status": supported,
  "model.select": supported,
  "permission.respond": supported,
  "project.list": {
    note: "Uses the generated project endpoint until project discovery is available under OpenCode v2.",
    state: "conditional",
  },
  "question.respond": supported,
  "session.children": supported,
  "session.create": supported,
  "session.list": supported,
  "session.resume": {
    note: "OpenCode sessions are persistent; resume loads the existing session and timeline.",
    state: "conditional",
  },
  "session.share": supported,
  "shell.run": supported,
  "timeline.stream": supported,
  "turn.cancel": supported,
  "turn.revert": supported,
  "turn.send": supported,
} satisfies Record<CapabilityId, CapabilitySupport>;

export const openCodeManifest = providerManifestSchema.parse({
  capabilities,
  controls: [],
  displayName: "OpenCode",
  id: "opencode",
  protocolVersion: 1,
});
