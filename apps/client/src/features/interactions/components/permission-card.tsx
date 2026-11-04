import { useValue } from "@legendapp/state/react";
import type {
  PendingInteraction,
  PermissionDecision,
} from "@vibepad/protocol/interactions";
import { useCallback } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { idlePermissionResponse } from "@/features/interactions/state/interaction-response-store";
import {
  useVibePadHost,
  useVibePadInteractionResponseStore,
} from "@/lib/vibepad-host-context";

export function PermissionCard({
  interaction,
  onResolved,
}: {
  readonly interaction: Extract<
    PendingInteraction,
    { readonly kind: "permission" }
  >;
  readonly onResolved: () => Promise<void>;
}) {
  const host = useVibePadHost();
  const responses = useVibePadInteractionResponseStore();
  const response = useValue(() => {
    const current =
      responses.state$.bySessionId[interaction.sessionId]?.[
        interaction.id
      ]?.get();
    return current?.kind === "permission" ? current : idlePermissionResponse;
  });

  const respond = useCallback(
    async (decision: PermissionDecision) => {
      if (!responses.beginResolve(interaction)) {
        return;
      }
      try {
        await host.respondPermission(
          interaction.sessionId,
          interaction.id,
          decision
        );
        await onResolved();
        responses.completeResolve(interaction);
      } catch (reason) {
        responses.failResolve(
          interaction,
          reason instanceof Error
            ? reason.message
            : "Unable to answer permission"
        );
      }
    },
    [host, interaction, onResolved, responses]
  );
  const reject = useCallback(() => respond("reject"), [respond]);
  const allowOnce = useCallback(() => respond("once"), [respond]);
  const allowAlways = useCallback(() => respond("always"), [respond]);

  return (
    <View
      className="gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
      testID={`permission-request-${interaction.id}`}
    >
      <View className="gap-1">
        <Text className="text-sm font-semibold">Permission required</Text>
        <Text className="text-sm" selectable>
          {interaction.action}
        </Text>
        {interaction.resources.map((resource) => (
          <Text
            className="text-muted-foreground font-mono text-xs"
            key={resource}
            selectable
          >
            {resource}
          </Text>
        ))}
      </View>
      {response.errorMessage ? (
        <Text className="text-xs text-red-600">{response.errorMessage}</Text>
      ) : null}
      <View className="flex-row flex-wrap justify-end gap-2">
        <Button
          disabled={response.resolving}
          onPress={reject}
          size="sm"
          testID="permission-reject"
          variant="ghost"
        >
          <Text>Deny</Text>
        </Button>
        <Button
          disabled={response.resolving}
          onPress={allowOnce}
          size="sm"
          testID="permission-allow-once"
          variant="outline"
        >
          <Text>Allow once</Text>
        </Button>
        <Button
          disabled={response.resolving}
          onPress={allowAlways}
          size="sm"
          testID="permission-allow-always"
        >
          <Text>Always allow</Text>
        </Button>
      </View>
    </View>
  );
}
