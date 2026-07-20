import type { ModelReference } from "@vibepad/protocol/catalog";
import type {
  PendingSessionInput,
  SessionActivity,
  SessionSummary,
} from "@vibepad/protocol/provider";

import type { Thread } from "../generated/v2/Thread";
import { codexProjectId, codexSessionId } from "./ids";

export interface CodexSessionState {
  readonly agent?: string;
  readonly model?: ModelReference;
}

const mapActivity = (thread: Thread): SessionActivity => {
  if (thread.status.type === "active") {
    return "busy";
  }
  if (thread.status.type === "systemError") {
    return "retry";
  }
  return "idle";
};

const threadTitle = (thread: Thread) => {
  const preview = thread.preview.trim().split("\n")[0]?.trim();
  return thread.name?.trim() || preview?.slice(0, 200) || "New Codex session";
};

export const mapCodexSession = (
  thread: Thread,
  state: CodexSessionState | undefined,
  pendingInput?: PendingSessionInput
): SessionSummary => {
  const summary = {
    activity: mapActivity(thread),
    harnessId: "codex" as const,
    id: codexSessionId(thread.id),
    native: thread,
    ...(pendingInput ? { pendingInput } : {}),
    projectId: codexProjectId(thread.cwd),
    title: threadTitle(thread),
    updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
  };
  if (!state) {
    return { ...summary, controls: { status: "inventory" } };
  }
  return {
    ...summary,
    controls: {
      ...(state.agent ? { agent: state.agent } : {}),
      ...(state.model ? { model: state.model } : {}),
      status: "ready",
    },
  };
};
