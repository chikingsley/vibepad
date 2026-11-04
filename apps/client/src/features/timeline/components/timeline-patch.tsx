import { ScrollView, View } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const visibleLineLimit = 500;

const patchLineClass = (line: string) => {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return "text-muted-foreground";
  }
  if (line.startsWith("+")) {
    return "bg-emerald-500/10 text-emerald-700";
  }
  if (line.startsWith("-")) {
    return "bg-red-500/10 text-red-700";
  }
  if (line.startsWith("@@")) {
    return "bg-blue-500/10 text-blue-700";
  }
  return "text-foreground";
};

const contentLineClass = (mode: "added" | "content" | "deleted") => {
  if (mode === "added") {
    return "bg-emerald-500/10 text-emerald-700";
  }
  if (mode === "deleted") {
    return "bg-red-500/10 text-red-700";
  }
};

const identifyLines = (lines: readonly string[]) => {
  const occurrences = new Map<string, number>();
  return lines.map((line) => {
    const occurrence = (occurrences.get(line) ?? 0) + 1;
    occurrences.set(line, occurrence);
    return { id: `${occurrence}:${line}`, line };
  });
};

export function TimelinePatch({
  content,
  mode,
}: {
  readonly content: string;
  readonly mode: "added" | "content" | "deleted" | "diff";
}) {
  const allLines = content.split("\n");
  const lines = identifyLines(allLines.slice(0, visibleLineLimit));
  const hiddenCount = Math.max(allLines.length - lines.length, 0);

  return (
    <ScrollView nestedScrollEnabled style={{ maxHeight: 360 }}>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
        <View className="min-w-full py-1">
          {lines.map(({ id, line }, index) => (
            <View
              className={cn(
                "min-h-5 flex-row pr-3",
                mode === "diff" ? patchLineClass(line) : contentLineClass(mode)
              )}
              key={id}
            >
              <Text className="text-muted-foreground/55 w-10 shrink-0 px-2 text-right font-mono text-[10px]">
                {index + 1}
              </Text>
              <Text className="font-mono text-[11px] leading-5" selectable>
                {line || " "}
              </Text>
            </View>
          ))}
          {hiddenCount > 0 ? (
            <Text className="px-3 py-2 text-[11px]" variant="muted">
              {hiddenCount} more lines are hidden in this inline preview.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </ScrollView>
  );
}
