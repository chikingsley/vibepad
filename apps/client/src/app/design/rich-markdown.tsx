import { ScrollView, View } from "react-native";

import { Text } from "@/components/ui/text";
import { RichMarkdown } from "@/features/timeline/components/rich-markdown";

const completedSample = `# Streaming Markdown

VibePad renders assistant prose as **rich Markdown** with *emphasis*,
[links](https://docs.swmansion.com/react-native-worklets/), \`inline code\`,
and GFM tables.

## Table

| Renderer | Platform | Path |
| --- | --- | --- |
| StreamdownText | iOS, Android | streaming tail |
| EnrichedMarkdownText | iOS, Android, web | completed block |
| Plain text | everywhere | fallback |

## Code

\`\`\`ts
const mode = selectRichMarkdownMode(capabilities, streaming);
\`\`\`

> Blockquotes, lists, and thematic breaks render too.

- one
- two
- three

---

Done.
`;

const streamingSample =
  "Streaming tail keeps **incomplete emphasis and\n\n| half | tables |\n| --- |";

export default function RichMarkdownDesignScreen() {
  return (
    <ScrollView className="bg-background flex-1">
      <View
        className="mx-auto w-full max-w-3xl gap-6 px-5 py-8 sm:px-8"
        testID="rich-markdown-fixture"
      >
        <Text variant="muted">Completed block</Text>
        <View testID="rich-markdown-completed">
          <RichMarkdown content={completedSample} streaming={false} />
        </View>
        <Text variant="muted">Streaming tail</Text>
        <View testID="rich-markdown-streaming">
          <RichMarkdown content={streamingSample} streaming />
        </View>
      </View>
    </ScrollView>
  );
}
