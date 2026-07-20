import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { TriggerRef } from "@rn-primitives/popover";
import type {
  AgentSummary,
  ModelReference,
  ModelSummary,
  ProviderCatalog,
} from "@vibepad/protocol/catalog";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useRef, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";

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
import { cn } from "@/lib/utils";
import { ReasoningEffortControl } from "./reasoning-effort-control";

type ModelListItem =
  | {
      readonly id: string;
      readonly label: string;
      readonly type: "provider";
    }
  | {
      readonly id: string;
      readonly model: ModelSummary;
      readonly type: "model";
    };

const modelKey = (model: ModelReference) => `${model.providerId}:${model.id}`;
const modelListItemKey = (item: ModelListItem) => item.id;
const modelListItemType = (item: ModelListItem) => item.type;

function ModelOption({
  model,
  onSelect,
  selected,
}: {
  readonly model: ModelSummary;
  readonly onSelect: (model: ModelSummary) => void;
  readonly selected: boolean;
}) {
  const select = useCallback(() => {
    onSelect(model);
  }, [model, onSelect]);

  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "min-h-11 flex-row items-center gap-2 rounded-lg px-2 py-2",
        selected ? "bg-accent" : "active:bg-accent"
      )}
      onPress={select}
      testID={`model-option-${model.providerId}-${model.id}`}
    >
      <ProviderIcon
        className="text-muted-foreground"
        name={resolveProviderIconName(model.providerId)}
        size={15}
      />
      <View className="min-w-0 flex-1">
        <Text className="text-sm" numberOfLines={1}>
          {model.name}
        </Text>
        <Text className="text-[10px]" numberOfLines={1} variant="muted">
          {model.id}
        </Text>
      </View>
      {model.status === "active" ? null : (
        <Text className="text-[9px] uppercase" variant="muted">
          {model.status}
        </Text>
      )}
      {selected ? <Icon name="check" size={13} /> : null}
    </Pressable>
  );
}

function ModelControl({
  catalog,
  current,
  disabled,
  error,
  onSelect,
}: {
  readonly catalog: ProviderCatalog | undefined;
  readonly current: ModelReference | undefined;
  readonly disabled: boolean;
  readonly error: string | undefined;
  readonly onSelect: (model: ModelReference) => Promise<void>;
}) {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const triggerRef = useRef<TriggerRef>(null);
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | undefined>();
  const providerNames = useMemo(
    () =>
      new Map(
        catalog?.providers.map((provider) => [provider.id, provider.name]) ?? []
      ),
    [catalog]
  );
  const items = useMemo(() => {
    if (!catalog) {
      return [];
    }
    const normalizedQuery = query.trim().toLowerCase();
    const visibleModels = catalog.models.filter((model) => {
      if (!(model.enabled && model.status !== "deprecated")) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const providerName =
        providerNames.get(model.providerId) ?? model.providerId;
      return `${providerName} ${model.name} ${model.id}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
    const grouped = new Map<string, ModelSummary[]>();
    for (const model of visibleModels) {
      const models = grouped.get(model.providerId) ?? [];
      models.push(model);
      grouped.set(model.providerId, models);
    }
    const result: ModelListItem[] = [];
    const providerIds = [...grouped.keys()].sort((left, right) =>
      (providerNames.get(left) ?? left).localeCompare(
        providerNames.get(right) ?? right
      )
    );
    for (const providerId of providerIds) {
      result.push({
        id: `provider:${providerId}`,
        label: providerNames.get(providerId) ?? providerId,
        type: "provider",
      });
      const models = grouped.get(providerId) ?? [];
      for (const model of models.sort((left, right) =>
        left.name.localeCompare(right.name)
      )) {
        result.push({
          id: `model:${modelKey(model)}`,
          model,
          type: "model",
        });
      }
    }
    return result;
  }, [catalog, providerNames, query]);

  const select = useCallback(
    async (model: ModelSummary) => {
      setSelecting(true);
      setSelectionError(undefined);
      try {
        await onSelect(model);
        triggerRef.current?.close();
      } catch (reason) {
        setSelectionError(
          reason instanceof Error ? reason.message : "Unable to switch model"
        );
      } finally {
        setSelecting(false);
      }
    },
    [onSelect]
  );
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<ModelListItem>) =>
      item.type === "provider" ? (
        <View className="px-2 pt-3 pb-1">
          <Text className="font-semibold text-[10px] uppercase" variant="muted">
            {item.label}
          </Text>
        </View>
      ) : (
        <ModelOption
          model={item.model}
          onSelect={select}
          selected={
            current ? modelKey(item.model) === modelKey(current) : false
          }
        />
      ),
    [current, select]
  );
  const currentProvider = current?.providerId ?? "opencode";

  return (
    <Popover>
      <PopoverTrigger asChild ref={triggerRef}>
        <Button
          accessibilityLabel="Choose model"
          className="h-8 max-w-52 flex-row gap-1.5 px-2"
          disabled={disabled}
          testID="model-selector"
          variant="ghost"
        >
          <ProviderIcon
            className="text-muted-foreground"
            name={resolveProviderIconName(currentProvider)}
            size={13}
          />
          <Text
            className="min-w-0 text-[11px]"
            numberOfLines={1}
            variant="muted"
          >
            {current ? `${current.providerId} · ${current.id}` : "Choose model"}
          </Text>
          <Icon
            className="text-muted-foreground"
            name="chevron-down"
            size={10}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96 gap-2 rounded-xl p-2"
        side="top"
        sideOffset={8}
        testID="model-selector-menu"
      >
        <View className="flex-row items-center gap-2 rounded-lg border border-border px-3">
          <Icon className="text-muted-foreground" name="search" size={13} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            className="h-10 min-w-0 flex-1 text-foreground text-sm outline-none"
            onChangeText={setQuery}
            placeholder="Search providers and models…"
            placeholderTextColor={theme.mutedForeground}
            style={{ color: theme.foreground }}
            testID="model-selector-search"
            value={query}
          />
        </View>
        {error || selectionError ? (
          <Text className="px-2 text-red-600 text-xs">
            {selectionError ?? error}
          </Text>
        ) : null}
        <LegendList
          data={items}
          dataKey={`provider-models:${query.trim().toLocaleLowerCase()}`}
          estimatedItemSize={48}
          getItemType={modelListItemType}
          keyExtractor={modelListItemKey}
          recycleItems
          renderItem={renderItem}
          style={{ maxHeight: 360, opacity: selecting ? 0.55 : 1 }}
          testID="model-selector-list"
          {...(Platform.OS === "web"
            ? {}
            : { keyboardShouldPersistTaps: "handled" as const })}
        />
      </PopoverContent>
    </Popover>
  );
}

function AgentOption({
  agent,
  onSelect,
  selected,
}: {
  readonly agent: AgentSummary;
  readonly onSelect: (agent: AgentSummary) => void;
  readonly selected: boolean;
}) {
  const select = useCallback(() => {
    onSelect(agent);
  }, [agent, onSelect]);
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "min-h-10 flex-row items-center gap-2 rounded-lg px-2 py-2",
        selected ? "bg-accent" : "active:bg-accent"
      )}
      onPress={select}
      testID={`agent-option-${agent.id}`}
    >
      <Text className="min-w-0 flex-1 text-sm">{agent.id}</Text>
      {selected ? <Icon name="check" size={13} /> : null}
    </Pressable>
  );
}

function AgentControl({
  catalog,
  controlLabel,
  current,
  disabled,
  onSelect,
}: {
  readonly catalog: ProviderCatalog | undefined;
  readonly controlLabel: string;
  readonly current: string | undefined;
  readonly disabled: boolean;
  readonly onSelect: (agentId: string) => Promise<void>;
}) {
  const triggerRef = useRef<TriggerRef>(null);
  const [error, setError] = useState<string | undefined>();
  const agents =
    catalog?.agents.filter(
      (agent) => !agent.hidden && agent.mode !== "subagent"
    ) ?? [];
  const select = useCallback(
    async (agent: AgentSummary) => {
      setError(undefined);
      try {
        await onSelect(agent.id);
        triggerRef.current?.close();
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Unable to switch agent"
        );
      }
    },
    [onSelect]
  );

  return (
    <Popover>
      <PopoverTrigger asChild ref={triggerRef}>
        <Button
          accessibilityLabel={`Choose ${controlLabel.toLowerCase()}`}
          className="h-8 flex-row gap-1 px-2"
          disabled={disabled}
          testID="agent-selector"
          variant="ghost"
        >
          <Text
            className={cn(
              "text-[11px] capitalize",
              current === "plan"
                ? "text-amber-600 dark:text-amber-400"
                : "text-blue-600 dark:text-blue-400"
            )}
          >
            {current ?? controlLabel}
          </Text>
          <Icon
            className="text-muted-foreground"
            name="chevron-down"
            size={10}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 gap-1 rounded-xl p-2"
        side="top"
        sideOffset={8}
        testID="agent-selector-menu"
      >
        <Text className="px-2 pt-1 pb-1 font-semibold text-xs">
          {controlLabel}
        </Text>
        {agents.map((agent) => (
          <AgentOption
            agent={agent}
            key={agent.id}
            onSelect={select}
            selected={agent.id === current}
          />
        ))}
        {error ? (
          <Text className="px-2 text-red-600 text-xs">{error}</Text>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function ProviderControls({
  agent,
  catalog,
  catalogError,
  controlLabel,
  controlsReady,
  disabled,
  model,
  onSelectAgent,
  onSelectModel,
}: {
  readonly agent: string | undefined;
  readonly catalog: ProviderCatalog | undefined;
  readonly catalogError: string | undefined;
  readonly controlLabel: string;
  readonly controlsReady: boolean;
  readonly disabled: boolean;
  readonly model: ModelReference | undefined;
  readonly onSelectAgent: (agentId: string) => Promise<void>;
  readonly onSelectModel: (model: ModelReference) => Promise<void>;
}) {
  if (!controlsReady) {
    return (
      <View className="h-8 justify-center px-2">
        <Text className="text-[11px]" variant="muted">
          Loading session controls…
        </Text>
      </View>
    );
  }
  const currentModel = catalog?.models.find(
    (candidate) => model && modelKey(candidate) === modelKey(model)
  );
  return (
    <View className="min-w-0 flex-row items-center">
      <ModelControl
        catalog={catalog}
        current={model}
        disabled={disabled}
        error={catalogError}
        onSelect={onSelectModel}
      />
      <ReasoningEffortControl
        current={model}
        disabled={disabled}
        onSelect={onSelectModel}
        variants={currentModel?.variants ?? []}
      />
      <AgentControl
        catalog={catalog}
        controlLabel={controlLabel}
        current={agent}
        disabled={disabled}
        onSelect={onSelectAgent}
      />
    </View>
  );
}
