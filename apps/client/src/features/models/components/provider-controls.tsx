import type {
  ModelReference,
  ProviderCatalog,
} from "@vibepad/protocol/catalog";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { AgentControl } from "@/features/models/components/agent-control";
import { ModelControl } from "@/features/models/components/model-control";
import { ReasoningEffortControl } from "@/features/models/components/reasoning-effort-control";

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
    (candidate) =>
      model &&
      candidate.providerId === model.providerId &&
      candidate.id === model.id
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
