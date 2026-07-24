import { useCallback, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { AttachmentGroup } from "@/features/composer/components/attachment";
import { SessionComposer } from "@/features/composer/components/session-composer";
import { ReviewCaptureAttachment } from "@/features/preview/components/review-capture-attachment";

type AttachmentOption = "bundle" | "hybrid" | "strip";

const noop = () => undefined;

function OptionLabel({
  children,
  number,
  recommended = false,
}: {
  readonly children: string;
  readonly number: number;
  readonly recommended?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="size-6 items-center justify-center rounded-full bg-muted">
        <Text className="font-semibold text-[11px]">{number}</Text>
      </View>
      <Text className="font-semibold text-sm">{children}</Text>
      {recommended ? (
        <View className="rounded-full bg-blue-500/10 px-2 py-1">
          <Text className="font-medium text-[9px] text-blue-600">
            Recommended
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ComposerFrame({ children }: { readonly children: React.ReactNode }) {
  return (
    <View className="rounded-2xl border border-border bg-background p-3">
      {children}
    </View>
  );
}

function DetailInspector({ option }: { readonly option: AttachmentOption }) {
  const title = {
    bundle: "Review bundle",
    hybrid: "Review + key frames",
    strip: "Review attachments",
  }[option];

  return (
    <View
      className="gap-4 border-border bg-card p-4"
      style={{ minWidth: 280, width: 320 }}
      testID="attachment-detail-inspector"
    >
      <View className="flex-row items-center gap-2">
        <Icon className="text-muted-foreground" name="browser" size={15} />
        <Text className="min-w-0 flex-1 font-semibold text-sm">{title}</Text>
        <Button
          accessibilityLabel="Close inspector"
          size="icon"
          variant="ghost"
        >
          <Icon className="text-muted-foreground" name="x" size={14} />
        </Button>
      </View>
      <View className="gap-1 rounded-xl bg-muted/60 p-3">
        <Text className="font-medium text-xs">Preview context</Text>
        <Text className="text-[10px]" variant="muted">
          http://home-mac:8081/checkout
        </Text>
        <Text className="text-[10px]" variant="muted">
          1366 × 1024 · iPad Pro 13-inch
        </Text>
      </View>
      <View className="gap-3">
        <Text className="text-muted-foreground" variant="caption">
          Review timeline
        </Text>
        <View className="flex-row gap-3">
          <Text className="w-10 text-[10px] text-blue-600">00:04</Text>
          <Text className="min-w-0 flex-1 text-[11px]">
            Selected the plan switcher
          </Text>
        </View>
        <View className="flex-row gap-3">
          <Text className="w-10 text-[10px] text-blue-600">00:18</Text>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-[11px]">Circled card spacing</Text>
            <Text
              className="font-mono text-[9px]"
              numberOfLines={1}
              variant="muted"
            >
              button[data-slot=plan-card]
            </Text>
          </View>
        </View>
        <View className="flex-row gap-3">
          <Text className="w-10 text-[10px] text-blue-600">00:31</Text>
          <Text className="min-w-0 flex-1 text-[11px]">
            Drew the intended alignment
          </Text>
        </View>
      </View>
      <Text className="mt-auto text-[10px] leading-4" variant="muted">
        This detail is opened deliberately from the attachment. It is not a
        floating overlay on the live preview.
      </Text>
    </View>
  );
}

export function AttachmentOptionsScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const [draft, setDraft] = useState("");
  const [option, setOption] = useState<AttachmentOption>("strip");
  const showBundle = useCallback(() => setOption("bundle"), []);
  const showHybrid = useCallback(() => setOption("hybrid"), []);
  const showStrip = useCallback(() => setOption("strip"), []);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="h-14 flex-row items-center border-border border-b px-5">
        <Text className="font-semibold">Review attachment directions</Text>
        <Text className="ml-3 text-xs" variant="muted">
          Real React Native components · tap any attachment for details
        </Text>
      </View>
      <View className={wide ? "min-h-0 flex-1 flex-row" : "min-h-0 flex-1"}>
        <ScrollView
          className="min-w-0 flex-1"
          contentContainerClassName="mx-auto w-full max-w-4xl gap-8 p-6"
          testID="attachment-options"
        >
          <View className="gap-2">
            <Text className="font-semibold text-2xl">Composer attachments</Text>
            <Text className="max-w-2xl text-sm leading-5" variant="muted">
              These keep the shadcn attachment anatomy while preserving the
              vector strokes, DOM anchors, and voice timestamps behind the
              visible item.
            </Text>
          </View>

          <View className="gap-3">
            <OptionLabel number={1}>Compact review bundle</OptionLabel>
            <Text className="text-xs" variant="muted">
              Quiet in the composer. One tap opens the complete review timeline.
            </Text>
            <ComposerFrame>
              <SessionComposer
                attachments={
                  <ReviewCaptureAttachment
                    cueCount={3}
                    detail="3 captures · 2 selections · 1 drawing"
                    durationMs={31_000}
                    onOpen={showBundle}
                    onRemove={noop}
                  />
                }
                canSend
                footerLeading={
                  <Text className="px-2 text-[11px]" variant="muted">
                    OpenCode · GPT-5.6
                  </Text>
                }
                onChangeText={setDraft}
                onSend={noop}
                placeholder="Tell the agent what should change…"
                sending={false}
                value={draft}
              />
            </ComposerFrame>
          </View>

          <View className="gap-3">
            <OptionLabel number={2} recommended>
              Timestamped review attachments
            </OptionLabel>
            <Text className="text-xs" variant="muted">
              Most literal and visual; best when every marked moment matters.
            </Text>
            <ComposerFrame>
              <SessionComposer
                attachments={
                  <AttachmentGroup>
                    <ReviewCaptureAttachment
                      cueCount={1}
                      durationMs={4000}
                      layout="tile"
                      onOpen={showStrip}
                      onRemove={noop}
                      title="00:04 · Select"
                    />
                    <ReviewCaptureAttachment
                      cueCount={1}
                      durationMs={18_000}
                      layout="tile"
                      onOpen={showStrip}
                      onRemove={noop}
                      title="00:18 · Draw"
                    />
                    <ReviewCaptureAttachment
                      cueCount={1}
                      durationMs={31_000}
                      layout="tile"
                      onOpen={showStrip}
                      onRemove={noop}
                      title="00:31 · Select"
                    />
                  </AttachmentGroup>
                }
                canSend
                footerLeading={
                  <Text className="px-2 text-[11px]" variant="muted">
                    3 linked moments
                  </Text>
                }
                onChangeText={setDraft}
                onSend={noop}
                placeholder="Add a note to these captures…"
                sending={false}
                value={draft}
              />
            </ComposerFrame>
          </View>

          <View className="gap-3 pb-4">
            <OptionLabel number={3}>Bundle with key frames</OptionLabel>
            <Text className="text-xs" variant="muted">
              A compact summary plus two visible frames. Richer, but taller.
            </Text>
            <ComposerFrame>
              <SessionComposer
                attachments={
                  <View className="gap-2">
                    <ReviewCaptureAttachment
                      cueCount={3}
                      detail="31 sec · voice aligned"
                      durationMs={31_000}
                      onOpen={showHybrid}
                      onRemove={noop}
                      title="Checkout review"
                    />
                    <AttachmentGroup>
                      <ReviewCaptureAttachment
                        cueCount={1}
                        durationMs={18_000}
                        layout="tile"
                        onOpen={showHybrid}
                        title="Spacing"
                      />
                      <ReviewCaptureAttachment
                        cueCount={1}
                        durationMs={31_000}
                        layout="tile"
                        onOpen={showHybrid}
                        title="Alignment"
                      />
                    </AttachmentGroup>
                  </View>
                }
                canSend
                footerLeading={
                  <Text className="px-2 text-[11px]" variant="muted">
                    OpenCode · GPT-5.6
                  </Text>
                }
                onChangeText={setDraft}
                onSend={noop}
                placeholder="Tell the agent what should change…"
                sending={false}
                value={draft}
              />
            </ComposerFrame>
          </View>
        </ScrollView>
        <DetailInspector option={option} />
      </View>
    </SafeAreaView>
  );
}
