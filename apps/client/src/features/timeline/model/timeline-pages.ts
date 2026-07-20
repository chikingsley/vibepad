import type { TimelinePage } from "@vibepad/protocol/timeline";

const pageWithCursor = (
  items: TimelinePage["items"],
  olderCursor: string | undefined
): TimelinePage => ({
  items,
  ...(olderCursor ? { olderCursor } : {}),
});

export function prependOlderTimelinePage(
  current: TimelinePage,
  older: TimelinePage
): TimelinePage {
  const currentIds = new Set(current.items.map(({ id }) => id));
  return pageWithCursor(
    [...older.items.filter(({ id }) => !currentIds.has(id)), ...current.items],
    older.olderCursor
  );
}

export function mergeLatestTimelinePage(
  current: TimelinePage,
  latest: TimelinePage
): TimelinePage {
  const latestById = new Map(latest.items.map((item) => [item.id, item]));
  const currentIds = new Set(current.items.map(({ id }) => id));
  return pageWithCursor(
    [
      ...current.items.map((item) => latestById.get(item.id) ?? item),
      ...latest.items.filter(({ id }) => !currentIds.has(id)),
    ],
    current.olderCursor
  );
}
