import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { TriggerRef } from "@rn-primitives/popover";
import type { VoiceCleanupPromptProfile } from "@vibepad/protocol/settings";
import type { VoiceCleanupModel } from "@vibepad/protocol/voice";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useRef, useState } from "react";
import { Platform, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import {
  Icon,
  ProviderIcon,
  resolveProviderIconName,
} from "@/components/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Text } from "@/components/ui/text";
import { THEME } from "@/lib/theme";

const providerLabel = (provider: string) =>
  provider.charAt(0).toLocaleUpperCase() + provider.slice(1);
const voiceModelKey = (model: VoiceCleanupModel) => model.id;

function VoiceModelOption({
  model,
  onSelect,
  selected,
}: {
  readonly model: VoiceCleanupModel;
  readonly onSelect: (modelId: string) => void;
  readonly selected: boolean;
}) {
  const select = useCallback(() => {
    onSelect(model.id);
  }, [model.id, onSelect]);

  return (
    <Button
      accessibilityLabel={`Use ${model.id} for dictation cleanup`}
      className="h-auto min-h-12 justify-start px-3 py-2"
      onPress={select}
      testID={`voice-cleanup-model-${model.id}`}
      variant="ghost"
    >
      <ProviderIcon
        className="text-muted-foreground"
        name={resolveProviderIconName(model.provider)}
        size={15}
      />
      <View className="min-w-0 flex-1 items-start gap-0.5">
        <Text className="font-medium text-xs" numberOfLines={1}>
          {model.id}
        </Text>
        <Text className="text-[10px]" variant="muted">
          {providerLabel(model.provider)}
          {model.profile ? ` · ${model.profile}` : ""}
        </Text>
      </View>
      {selected ? <Icon name="check" size={13} /> : null}
    </Button>
  );
}

export function VoiceCleanupModelPicker({
  disabled,
  models,
  onSelect,
  selectedModelId,
}: {
  readonly disabled: boolean;
  readonly models: readonly VoiceCleanupModel[];
  readonly onSelect: (modelId: string) => void;
  readonly selectedModelId: string | null;
}) {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const triggerRef = useRef<TriggerRef>(null);
  const [query, setQuery] = useState("");
  const selectedModel = models.find((model) => model.id === selectedModelId);
  const visibleModels = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      return models;
    }
    return models.filter((model) =>
      `${model.id} ${model.provider} ${model.profile ?? ""}`
        .toLocaleLowerCase()
        .includes(normalized)
    );
  }, [models, query]);
  const select = useCallback(
    (modelId: string) => {
      onSelect(modelId);
      triggerRef.current?.close();
    },
    [onSelect]
  );
  const renderModel = useCallback(
    ({ item: model }: LegendListRenderItemProps<VoiceCleanupModel>) => (
      <VoiceModelOption
        model={model}
        onSelect={select}
        selected={model.id === selectedModelId}
      />
    ),
    [select, selectedModelId]
  );
  const emptyModels = useMemo(
    () => (
      <Text className="px-3 py-5 text-center text-xs" variant="muted">
        No matching language models.
      </Text>
    ),
    []
  );

  return (
    <Popover>
      <PopoverTrigger asChild ref={triggerRef}>
        <Button
          className="max-w-64"
          disabled={disabled}
          size="sm"
          testID="voice-cleanup-model-trigger"
          variant="outline"
        >
          <Text className="max-w-52 text-xs" numberOfLines={1}>
            {selectedModel?.id ?? selectedModelId ?? "Choose model"}
          </Text>
          <Icon name="chevron-down" size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 gap-2 rounded-xl p-3"
        side="bottom"
        sideOffset={6}
        testID="voice-cleanup-model-menu"
      >
        <View className="flex-row items-center gap-2 rounded-lg border border-border px-3">
          <Icon className="text-muted-foreground" name="search" size={13} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            className="h-10 min-w-0 flex-1 text-foreground text-sm outline-none"
            onChangeText={setQuery}
            placeholder="Search Voice Lab models…"
            placeholderTextColor={theme.mutedForeground}
            style={{ color: theme.foreground }}
            testID="voice-cleanup-model-search"
            value={query}
          />
        </View>
        <LegendList
          contentContainerStyle={{ gap: 4 }}
          data={visibleModels}
          dataKey={`voice-models:${query.trim().toLocaleLowerCase()}`}
          estimatedItemSize={52}
          keyExtractor={voiceModelKey}
          ListEmptyComponent={emptyModels}
          recycleItems
          renderItem={renderModel}
          style={{ maxHeight: 288 }}
          {...(Platform.OS === "web"
            ? {}
            : { keyboardShouldPersistTaps: "handled" as const })}
        />
      </PopoverContent>
    </Popover>
  );
}

const promptProfiles: readonly {
  readonly id: VoiceCleanupPromptProfile;
  readonly label: string;
}[] = [
  { id: "coding", label: "Coding" },
  { id: "light", label: "Light" },
];

function VoiceCleanupProfileOption({
  onSelect,
  profile,
  selected,
}: {
  readonly onSelect: (profile: VoiceCleanupPromptProfile) => void;
  readonly profile: (typeof promptProfiles)[number];
  readonly selected: boolean;
}) {
  const select = useCallback(() => {
    onSelect(profile.id);
  }, [onSelect, profile.id]);

  return (
    <Button
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      className="h-7 px-2.5"
      onPress={select}
      size="sm"
      testID={`voice-cleanup-profile-${profile.id}`}
      variant={selected ? "secondary" : "ghost"}
    >
      <Text className="text-[11px]">{profile.label}</Text>
    </Button>
  );
}

export function VoiceCleanupProfileControl({
  onSelect,
  selected,
}: {
  readonly onSelect: (profile: VoiceCleanupPromptProfile) => void;
  readonly selected: VoiceCleanupPromptProfile;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      className="flex-row rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {promptProfiles.map((profile) => (
        <VoiceCleanupProfileOption
          key={profile.id}
          onSelect={onSelect}
          profile={profile}
          selected={selected === profile.id}
        />
      ))}
    </View>
  );
}
