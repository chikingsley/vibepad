import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import type { TriggerRef } from "@rn-primitives/popover";
import type { VoiceCleanupPromptProfile } from "@vibepad/protocol/settings";
import type { VoiceCleanupModel } from "@vibepad/protocol/voice";
import { useCallback, useMemo, useRef } from "react";
import { Platform, View } from "react-native";

import { Button } from "@/components/ui/button";
import {
  Icon,
  ProviderIcon,
  resolveProviderIconName,
} from "@/components/ui/icon";
import { ObservableSearchField } from "@/components/ui/observable-search-field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Text } from "@/components/ui/text";
import { boundedListHeight } from "@/lib/virtualized-list-layout";

const providerLabel = (provider: string) =>
  provider.charAt(0).toLocaleUpperCase() + provider.slice(1);
const voiceModelKey = (model: VoiceCleanupModel) => model.id;
const voiceModelItemSize = () => 48;

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
        <Text className="text-xs font-medium" numberOfLines={1}>
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

function VoiceModelResults({
  models,
  onSelect,
  query$,
  selectedModelId,
}: {
  readonly models: readonly VoiceCleanupModel[];
  readonly onSelect: (modelId: string) => void;
  readonly query$: Observable<string>;
  readonly selectedModelId: string | null;
}) {
  const query = useValue(query$);
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
  const renderModel = useCallback(
    ({ item: model }: LegendListRenderItemProps<VoiceCleanupModel>) => (
      <VoiceModelOption
        model={model}
        onSelect={onSelect}
        selected={model.id === selectedModelId}
      />
    ),
    [onSelect, selectedModelId]
  );
  const emptyModels = useMemo(
    () => (
      <Text className="px-3 py-5 text-center text-xs" variant="muted">
        No matching language models.
      </Text>
    ),
    []
  );
  const listHeight = boundedListHeight({
    emptyHeight: 56,
    gap: 4,
    itemSize: voiceModelItemSize,
    items: visibleModels,
    maxHeight: 288,
  });

  return (
    <View style={{ height: listHeight }}>
      <LegendList
        contentContainerStyle={{ gap: 4 }}
        data={visibleModels}
        dataKey="voice-models"
        getFixedItemSize={voiceModelItemSize}
        keyExtractor={voiceModelKey}
        ListEmptyComponent={emptyModels}
        recycleItems
        renderItem={renderModel}
        style={{ flex: 1 }}
        {...(Platform.OS === "web"
          ? {}
          : { keyboardShouldPersistTaps: "handled" as const })}
      />
    </View>
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
  const triggerRef = useRef<TriggerRef>(null);
  const query$ = useObservable("");
  const selectedModel = models.find((model) => model.id === selectedModelId);
  const select = useCallback(
    (modelId: string) => {
      onSelect(modelId);
      triggerRef.current?.close();
    },
    [onSelect]
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
        <ObservableSearchField
          placeholder="Search Voice Lab models…"
          query$={query$}
          testID="voice-cleanup-model-search"
        />
        <VoiceModelResults
          models={models}
          onSelect={select}
          query$={query$}
          selectedModelId={selectedModelId}
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
      className="border-border bg-muted/40 flex-row rounded-lg border p-0.5"
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
