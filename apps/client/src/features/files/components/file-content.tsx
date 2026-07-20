import { ScrollView, View } from "react-native";

import { Text } from "@/components/ui/text";
import { useProjectFileContent } from "@/lib/use-project-files";

export function FileContent({
  active,
  path,
  projectId,
}: {
  readonly active: boolean;
  readonly path: string | undefined;
  readonly projectId: string;
}) {
  const content = useProjectFileContent(projectId, path, active);

  if (!path) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text variant="muted">Select a file to inspect it.</Text>
      </View>
    );
  }
  if (content.status === "loading" || content.status === "idle") {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text variant="muted">Loading {path}…</Text>
      </View>
    );
  }
  if (content.status === "error") {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-red-600 text-sm">{content.message}</Text>
      </View>
    );
  }
  if (content.data.type === "binary") {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text variant="muted">
          Binary file
          {content.data.mimeType ? ` · ${content.data.mimeType}` : ""}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="min-w-full p-4"
      testID="file-content"
    >
      <Text className="font-mono text-[12px] leading-5" selectable>
        {content.data.content}
      </Text>
    </ScrollView>
  );
}
