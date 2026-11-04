import { useValue } from "@legendapp/state/react";
import type {
  QuestionOption,
  QuestionRequest,
} from "@vibepad/protocol/interactions";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { createIdleQuestionResponse } from "@/features/interactions/state/interaction-response-store";
import { cn } from "@/lib/utils";
import {
  useVibePadHost,
  useVibePadInteractionResponseStore,
} from "@/lib/vibepad-host-context";

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
      <Text className="text-sm font-medium">{option.label}</Text>
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
      className="border-border bg-background text-foreground min-h-10 rounded-lg border px-3 py-2 text-sm outline-none"
      onChangeText={change}
      placeholder="Other answer…"
      placeholderTextColor={colorScheme === "dark" ? "#9a9ea8" : "#666b75"}
      testID={`question-custom-${index}`}
      value={value}
    />
  );
}

export function QuestionCard({
  interaction,
  onResolved,
}: {
  readonly interaction: QuestionRequest;
  readonly onResolved: () => Promise<void>;
}) {
  const host = useVibePadHost();
  const responses = useVibePadInteractionResponseStore();
  const fallback = useMemo(
    () => createIdleQuestionResponse(interaction),
    [interaction]
  );
  const response = useValue(() => {
    const current =
      responses.state$.bySessionId[interaction.sessionId]?.[
        interaction.id
      ]?.get();
    return current?.kind === "question" ? current : fallback;
  });
  const resolvedAnswers = useMemo(
    () =>
      response.answers.map((answer, index) => {
        const custom = response.customAnswers[index]?.trim();
        return custom ? [...answer, custom] : [...answer];
      }),
    [response.answers, response.customAnswers]
  );
  const canAnswer = resolvedAnswers.every((answer) => answer.length > 0);

  const selectOption = useCallback(
    (questionIndex: number, label: string, multiple: boolean) => {
      responses.selectQuestionOption(
        interaction,
        questionIndex,
        label,
        multiple
      );
    },
    [interaction, responses]
  );
  const updateCustomAnswer = useCallback(
    (questionIndex: number, value: string) => {
      responses.setCustomAnswer(interaction, questionIndex, value);
    },
    [interaction, responses]
  );
  const respond = useCallback(
    async (action: "answer" | "reject") => {
      if (!responses.beginResolve(interaction)) {
        return;
      }
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
        responses.completeResolve(interaction);
      } catch (reason) {
        responses.failResolve(
          interaction,
          reason instanceof Error ? reason.message : "Unable to answer question"
        );
      }
    },
    [host, interaction, onResolved, resolvedAnswers, responses]
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
            <Text className="text-sm font-semibold">{question.header}</Text>
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
                  response.answers[questionIndex]?.includes(option.label) ??
                  false
                }
              />
            ))}
          </View>
          {question.custom ? (
            <QuestionCustomAnswer
              index={questionIndex}
              onChange={updateCustomAnswer}
              value={response.customAnswers[questionIndex] ?? ""}
            />
          ) : null}
        </View>
      ))}
      {response.errorMessage ? (
        <Text className="text-xs text-red-600">{response.errorMessage}</Text>
      ) : null}
      <View className="flex-row justify-end gap-2">
        <Button
          disabled={response.resolving}
          onPress={reject}
          size="sm"
          testID="question-reject"
          variant="ghost"
        >
          <Text>Dismiss</Text>
        </Button>
        <Button
          disabled={response.resolving || !canAnswer}
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
