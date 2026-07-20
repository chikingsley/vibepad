import type {
  PendingInteraction,
  PermissionDecision,
  QuestionOption,
  QuestionRequest,
} from "@vibepad/protocol/interactions";
import { useColorScheme } from "nativewind";
import { useCallback, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useVibePadHost } from "@/lib/vibepad-host-context";

function QuestionOptionButton({
  index,
  multiple,
  onSelect,
  option,
  selected,
}: {
  readonly index: number;
  readonly multiple: boolean;
  readonly onSelect: (index: number, label: string, multiple: boolean) => void;
  readonly option: QuestionOption;
  readonly selected: boolean;
}) {
  const select = useCallback(() => {
    onSelect(index, option.label, multiple);
  }, [index, multiple, onSelect, option.label]);

  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "gap-0.5 rounded-lg border px-3 py-2",
        selected
          ? "border-blue-500 bg-blue-500/10"
          : "border-border bg-background active:bg-accent"
      )}
      onPress={select}
      testID={`question-option-${index}-${option.label}`}
    >
      <Text className="font-medium text-sm">{option.label}</Text>
      {option.description ? (
        <Text className="text-muted-foreground text-xs">
          {option.description}
        </Text>
      ) : null}
    </Pressable>
  );
}

function QuestionCustomAnswer({
  index,
  onChange,
  value,
}: {
  readonly index: number;
  readonly onChange: (index: number, value: string) => void;
  readonly value: string;
}) {
  const { colorScheme } = useColorScheme();
  const change = useCallback(
    (nextValue: string) => {
      onChange(index, nextValue);
    },
    [index, onChange]
  );

  return (
    <TextInput
      className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm outline-none"
      onChangeText={change}
      placeholder="Other answer…"
      placeholderTextColor={colorScheme === "dark" ? "#9a9ea8" : "#666b75"}
      testID={`question-custom-${index}`}
      value={value}
    />
  );
}

function PermissionCard({
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
  const [error, setError] = useState<string | undefined>();
  const [resolving, setResolving] = useState(false);

  const respond = useCallback(
    async (decision: PermissionDecision) => {
      setError(undefined);
      setResolving(true);
      try {
        await host.respondPermission(
          interaction.sessionId,
          interaction.id,
          decision
        );
        await onResolved();
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to answer permission"
        );
      } finally {
        setResolving(false);
      }
    },
    [host, interaction.id, interaction.sessionId, onResolved]
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
        <Text className="font-semibold text-sm">Permission required</Text>
        <Text className="text-sm" selectable>
          {interaction.action}
        </Text>
        {interaction.resources.map((resource) => (
          <Text
            className="font-mono text-muted-foreground text-xs"
            key={resource}
            selectable
          >
            {resource}
          </Text>
        ))}
      </View>
      {error ? <Text className="text-red-600 text-xs">{error}</Text> : null}
      <View className="flex-row flex-wrap justify-end gap-2">
        <Button
          disabled={resolving}
          onPress={reject}
          size="sm"
          testID="permission-reject"
          variant="ghost"
        >
          <Text>Deny</Text>
        </Button>
        <Button
          disabled={resolving}
          onPress={allowOnce}
          size="sm"
          testID="permission-allow-once"
          variant="outline"
        >
          <Text>Allow once</Text>
        </Button>
        <Button
          disabled={resolving}
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

function QuestionCard({
  interaction,
  onResolved,
}: {
  readonly interaction: QuestionRequest;
  readonly onResolved: () => Promise<void>;
}) {
  const host = useVibePadHost();
  const [answers, setAnswers] = useState<readonly (readonly string[])[]>(() =>
    interaction.questions.map(() => [])
  );
  const [customAnswers, setCustomAnswers] = useState<readonly string[]>(() =>
    interaction.questions.map(() => "")
  );
  const [error, setError] = useState<string | undefined>();
  const [resolving, setResolving] = useState(false);

  const selectOption = useCallback(
    (questionIndex: number, label: string, multiple: boolean) => {
      setAnswers((current) =>
        current.map((answer, index) => {
          if (index !== questionIndex) {
            return answer;
          }
          if (!multiple) {
            return [label];
          }
          return answer.includes(label)
            ? answer.filter((candidate) => candidate !== label)
            : [...answer, label];
        })
      );
    },
    []
  );

  const updateCustomAnswer = useCallback(
    (questionIndex: number, value: string) => {
      setCustomAnswers((current) =>
        current.map((answer, index) =>
          index === questionIndex ? value : answer
        )
      );
    },
    []
  );

  const resolvedAnswers = answers.map((answer, index) => {
    const custom = customAnswers[index]?.trim();
    return custom ? [...answer, custom] : [...answer];
  });
  const canAnswer = resolvedAnswers.every((answer) => answer.length > 0);

  const respond = useCallback(
    async (action: "answer" | "reject") => {
      setError(undefined);
      setResolving(true);
      try {
        await host.respondQuestion(
          action === "answer"
            ? {
                action,
                answers: resolvedAnswers,
                requestId: interaction.id,
                sessionId: interaction.sessionId,
              }
            : {
                action,
                requestId: interaction.id,
                sessionId: interaction.sessionId,
              }
        );
        await onResolved();
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Unable to answer question"
        );
      } finally {
        setResolving(false);
      }
    },
    [host, interaction.id, interaction.sessionId, onResolved, resolvedAnswers]
  );
  const reject = useCallback(() => respond("reject"), [respond]);
  const submitAnswer = useCallback(() => respond("answer"), [respond]);

  return (
    <View
      className="gap-4 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4"
      testID={`question-request-${interaction.id}`}
    >
      {interaction.questions.map((question, questionIndex) => (
        <View className="gap-2" key={`${interaction.id}:${question.header}`}>
          <View className="gap-1">
            <Text className="font-semibold text-sm">{question.header}</Text>
            <Text className="text-sm">{question.question}</Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {question.options.map((option) => (
              <QuestionOptionButton
                index={questionIndex}
                key={option.label}
                multiple={question.multiple}
                onSelect={selectOption}
                option={option}
                selected={
                  answers[questionIndex]?.includes(option.label) ?? false
                }
              />
            ))}
          </View>
          {question.custom ? (
            <QuestionCustomAnswer
              index={questionIndex}
              onChange={updateCustomAnswer}
              value={customAnswers[questionIndex] ?? ""}
            />
          ) : null}
        </View>
      ))}
      {error ? <Text className="text-red-600 text-xs">{error}</Text> : null}
      <View className="flex-row justify-end gap-2">
        <Button
          disabled={resolving}
          onPress={reject}
          size="sm"
          testID="question-reject"
          variant="ghost"
        >
          <Text>Dismiss</Text>
        </Button>
        <Button
          disabled={resolving || !canAnswer}
          onPress={submitAnswer}
          size="sm"
          testID="question-answer"
        >
          <Text>Answer</Text>
        </Button>
      </View>
    </View>
  );
}

export function SessionInteractions({
  interactions,
  onResolved,
}: {
  readonly interactions: readonly PendingInteraction[];
  readonly onResolved: () => Promise<void>;
}) {
  if (interactions.length === 0) {
    return null;
  }

  return (
    <View className="gap-3" testID="session-interactions">
      {interactions.map((interaction) =>
        interaction.kind === "permission" ? (
          <PermissionCard
            interaction={interaction}
            key={interaction.id}
            onResolved={onResolved}
          />
        ) : (
          <QuestionCard
            interaction={interaction}
            key={interaction.id}
            onResolved={onResolved}
          />
        )
      )}
    </View>
  );
}
