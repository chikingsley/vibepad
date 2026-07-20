export function boundedListHeight<Item>({
  emptyHeight,
  gap = 0,
  itemSize,
  items,
  maxHeight,
}: {
  readonly emptyHeight: number;
  readonly gap?: number;
  readonly itemSize: (item: Item) => number;
  readonly items: readonly Item[];
  readonly maxHeight: number;
}) {
  const contentHeight = items.reduce(
    (height, item, index) => height + itemSize(item) + (index === 0 ? 0 : gap),
    0
  );
  return Math.min(maxHeight, Math.max(emptyHeight, contentHeight));
}
