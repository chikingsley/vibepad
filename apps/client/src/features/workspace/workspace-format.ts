import type { SessionSummary } from "@vibepad/protocol/provider";

export const sessionActivityLabel = (activity: SessionSummary["activity"]) => {
  if (activity === "busy") {
    return "Working";
  }
  if (activity === "retry") {
    return "Retrying";
  }
  return "Idle";
};

export const formatSessionUpdatedAt = (updatedAt: string | undefined) => {
  if (!updatedAt) {
    return "No activity yet";
  }

  const elapsedMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(updatedAt).getTime()) / 60_000)
  );
  if (elapsedMinutes < 1) {
    return "Just now";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }
  const elapsedDays = Math.round(elapsedHours / 24);
  return elapsedDays === 1 ? "Yesterday" : `${elapsedDays}d`;
};
