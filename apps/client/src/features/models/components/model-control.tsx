import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import type { TriggerRef } from "@rn-primitives/popover";
import type {
  ModelReference,
  ModelSummary,
  ProviderCatalog,
} from "@vibepad/protocol/catalog";
import { useCallback, useMemo, useRef } from "react";
import { Platform, Pressable, View } from "react-native";

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
import { cn } from "@/lib/utils";
import { boundedListHeight } from "@/lib/virtualized-list-layout";

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
const modelListItemSize = (item: ModelListItem) =>
  item.type === "provider" ? 32 : 44;

interface ModelSelectionState {
  selecting: boolean;
  selectionError: string | undefined;
}

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

function ModelSelectionError({
  catalogError,
  selection$,
}: {
  readonly catalogError: string | undefined;
  readonly selection$: Observable<ModelSelectionState>;
}) {
  const selectionError = useValue(selection$.selectionError);
  const message = selectionError ?? catalogError;
  return message ? (
    <Text className="px-2 text-red-600 text-xs">{message}</Text>
  ) : null;
}

function ModelResults({
  catalog,
  current,
  onSelect,
  query$,
  selection$,
}: {
  readonly catalog: ProviderCatalog | undefined;
  readonly current: ModelReference | undefined;
  readonly onSelect: (model: ModelSummary) => void;
  readonly query$: Observable<string>;
  readonly selection$: Observable<ModelSelectionState>;
}) {
  const query = useValue(query$);
  const selecting = useValue(selection$.selecting);
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
          onSelect={onSelect}
          selected={
            current ? modelKey(item.model) === modelKey(current) : false
          }
        />
      ),
    [current, onSelect]
  );
  const listHeight = boundedListHeight({
    emptyHeight: 48,
    itemSize: modelListItemSize,
    items,
    maxHeight: 360,
  });

  return (
    <View
      pointerEvents={selecting ? "none" : "auto"}
      style={{ height: listHeight }}
      testID="model-selector-list"
    >
      <LegendList
        data={items}
        dataKey="provider-models"
        getFixedItemSize={modelListItemSize}
        getItemType={modelListItemType}
        keyExtractor={modelListItemKey}
        recycleItems
        renderItem={renderItem}
        style={{ flex: 1, opacity: selecting ? 0.55 : 1 }}
        {...(Platform.OS === "web"
          ? {}
          : { keyboardShouldPersistTaps: "handled" as const })}
      />
    </View>
  );
}

export function ModelControl({
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
  const triggerRef = useRef<TriggerRef>(null);
  const query$ = useObservable("");
  const selection$ = useObservable<ModelSelectionState>({
    selecting: false,
    selectionError: undefined,
  });
  const select = useCallback(
    async (model: ModelSummary) => {
      if (selection$.selecting.peek()) {
        return;
      }
      selection$.assign({ selecting: true, selectionError: undefined });
      try {
        await onSelect(model);
        triggerRef.current?.close();
      } catch (reason) {
        selection$.selectionError.set(
          reason instanceof Error ? reason.message : "Unable to switch model"
        );
      } finally {
        selection$.selecting.set(false);
      }
    },
    [onSelect, selection$]
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
        <ObservableSearchField
          placeholder="Search providers and models…"
          query$={query$}
          testID="model-selector-search"
        />
        <ModelSelectionError catalogError={error} selection$={selection$} />
        <ModelResults
          catalog={catalog}
          current={current}
          onSelect={select}
          query$={query$}
          selection$={selection$}
        />
      </PopoverContent>
    </Popover>
  );
}
