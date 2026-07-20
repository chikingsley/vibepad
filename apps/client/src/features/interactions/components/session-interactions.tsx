import type { PendingInteraction } from "@vibepad/protocol/interactions";
import { useEffect } from "react";
import { View } from "react-native";

import { PermissionCard } from "@/features/interactions/components/permission-card";
import { QuestionCard } from "@/features/interactions/components/question-card";
import { useVibePadInteractionResponseStore } from "@/lib/vibepad-host-context";

export function SessionInteractions({
  active,
  interactions,
  onResolved,
  sessionId,
}: {
  readonly active: boolean;
  readonly interactions: readonly PendingInteraction[];
  readonly onResolved: () => Promise<void>;
  readonly sessionId: string;
}) {
  const responses = useVibePadInteractionResponseStore();
  useEffect(() => {
    if (active) {
      responses.reconcileSession(sessionId, interactions);
    }
  }, [active, interactions, responses, sessionId]);

  if (interactions.length === 0) {
    return null;
  }

  return (
    <View className="gap-3" testID="session-interactions">
      {interactions.map((interaction) =>
        interaction.kind === "permission" ? (
          <PermissionCard
            interaction={interaction}
            key={`${interaction.sessionId}:${interaction.id}`}
            onResolved={onResolved}
          />
        ) : (
          <QuestionCard
            interaction={interaction}
            key={`${interaction.sessionId}:${interaction.id}`}
            onResolved={onResolved}
          />
        )
      )}
    </View>
  );
}
