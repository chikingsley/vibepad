import type { SessionSummary } from "@vibepad/protocol/provider";

import type { SessionIndicatorState } from "@/features/workspace/components/status-indicators";

export const sessionStateLabel: Record<SessionIndicatorState, string> = {
  idle: "idle",
  permission: "waiting for permission",
  question: "waiting for an answer",
  retrying: "retrying",
  working: "working",
};

export const stateForSession = (
  session: SessionSummary
): SessionIndicatorState => {
  if (session.pendingInput) {
    return session.pendingInput;
  }
  if (session.activity === "busy") {
    return "working";
  }
  if (session.activity === "retry") {
    return "retrying";
  }
  return "idle";
};

export const aggregateSessionState = (
  sessions: readonly SessionSummary[]
): SessionIndicatorState => {
  const states = sessions.map(stateForSession);
  if (states.includes("permission")) {
    return "permission";
  }
  if (states.includes("question")) {
    return "question";
  }
  if (states.includes("retrying")) {
    return "retrying";
  }
  return states.includes("working") ? "working" : "idle";
};
