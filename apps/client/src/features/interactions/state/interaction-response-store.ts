import { type Observable, observable } from "@legendapp/state";
import type {
  PendingInteraction,
  QuestionRequest,
} from "@vibepad/protocol/interactions";

export interface PermissionResponseRecord {
  errorMessage: string | undefined;
  kind: "permission";
  resolving: boolean;
}

export interface QuestionResponseRecord {
  answers: string[][];
  customAnswers: string[];
  errorMessage: string | undefined;
  kind: "question";
  requestSignature: string;
  resolving: boolean;
}

export type InteractionResponseRecord =
  | PermissionResponseRecord
  | QuestionResponseRecord;

export interface InteractionResponseState {
  bySessionId: Record<string, Record<string, InteractionResponseRecord>>;
}

export interface InteractionResponseStore {
  readonly beginResolve: (interaction: PendingInteraction) => boolean;
  readonly completeResolve: (interaction: PendingInteraction) => void;
  readonly failResolve: (
    interaction: PendingInteraction,
    message: string
  ) => void;
  readonly read: (
    sessionId: string,
    interactionId: string
  ) => InteractionResponseRecord | undefined;
  readonly reconcileSession: (
    sessionId: string,
    interactions: readonly PendingInteraction[]
  ) => void;
  readonly selectQuestionOption: (
    interaction: QuestionRequest,
    questionIndex: number,
    label: string,
    multiple: boolean
  ) => void;
  readonly setCustomAnswer: (
    interaction: QuestionRequest,
    questionIndex: number,
    value: string
  ) => void;
  readonly state$: Observable<InteractionResponseState>;
}

export const idlePermissionResponse: PermissionResponseRecord = {
  errorMessage: undefined,
  kind: "permission",
  resolving: false,
};

export const createIdleQuestionResponse = (
  interaction: QuestionRequest
): QuestionResponseRecord => ({
  answers: interaction.questions.map(() => []),
  customAnswers: interaction.questions.map(() => ""),
  errorMessage: undefined,
  kind: "question",
  requestSignature: JSON.stringify(interaction.questions),
  resolving: false,
});

const createResponse = (
  interaction: PendingInteraction
): InteractionResponseRecord =>
  interaction.kind === "permission"
    ? { ...idlePermissionResponse }
    : createIdleQuestionResponse(interaction);

const responseMatches = (
  response: InteractionResponseRecord | undefined,
  interaction: PendingInteraction
) => {
  if (!response || response.kind !== interaction.kind) {
    return false;
  }
  if (interaction.kind === "permission") {
    return true;
  }
  return (
    response.kind === "question" &&
    response.requestSignature === JSON.stringify(interaction.questions)
  );
};

export function createInteractionResponseStore(): InteractionResponseStore {
  const state$ = observable<InteractionResponseState>({ bySessionId: {} });

  const read = (sessionId: string, interactionId: string) =>
    state$.bySessionId[sessionId]?.peek()?.[interactionId];

  const setResponse = (
    sessionId: string,
    interactionId: string,
    response: InteractionResponseRecord
  ) => {
    if (state$.bySessionId.peek()[sessionId] === undefined) {
      state$.bySessionId.assign({ [sessionId]: {} });
    }
    state$.bySessionId[sessionId]?.assign({ [interactionId]: response });
  };

  const responseFor = (
    interaction: PendingInteraction
  ): InteractionResponseRecord => {
    const current = read(interaction.sessionId, interaction.id);
    if (current && responseMatches(current, interaction)) {
      return current;
    }
    const created = createResponse(interaction);
    setResponse(interaction.sessionId, interaction.id, created);
    return created;
  };

  const completeResolve = (interaction: PendingInteraction) => {
    const session = state$.bySessionId[interaction.sessionId]?.peek();
    if (!session) {
      return;
    }
    if (Object.keys(session).length === 1 && session[interaction.id]) {
      state$.bySessionId[interaction.sessionId]?.delete();
      return;
    }
    state$.bySessionId[interaction.sessionId]?.[interaction.id]?.delete();
  };

  return {
    beginResolve: (interaction) => {
      const current = responseFor(interaction);
      if (current.resolving) {
        return false;
      }
      setResponse(interaction.sessionId, interaction.id, {
        ...current,
        errorMessage: undefined,
        resolving: true,
      });
      return true;
    },
    completeResolve,
    failResolve: (interaction, message) => {
      const current = responseFor(interaction);
      setResponse(interaction.sessionId, interaction.id, {
        ...current,
        errorMessage: message,
        resolving: false,
      });
    },
    read,
    reconcileSession: (sessionId, interactions) => {
      const current = state$.bySessionId[sessionId]?.peek() ?? {};
      const next: Record<string, InteractionResponseRecord> = {};
      let changed = Object.keys(current).length !== interactions.length;
      for (const interaction of interactions) {
        const previous = current[interaction.id];
        const response =
          previous && responseMatches(previous, interaction)
            ? previous
            : createResponse(interaction);
        next[interaction.id] = response;
        changed ||= response !== previous;
      }
      if (!changed) {
        return;
      }
      if (interactions.length === 0) {
        state$.bySessionId[sessionId]?.delete();
        return;
      }
      state$.bySessionId.assign({ [sessionId]: next });
    },
    selectQuestionOption: (interaction, questionIndex, label, multiple) => {
      const current = responseFor(interaction);
      if (current.kind !== "question") {
        return;
      }
      const answers = current.answers.map((answer, index) => {
        if (index !== questionIndex) {
          return answer;
        }
        if (!multiple) {
          return [label];
        }
        return answer.includes(label)
          ? answer.filter((candidate) => candidate !== label)
          : [...answer, label];
      });
      setResponse(interaction.sessionId, interaction.id, {
        ...current,
        answers,
      });
    },
    setCustomAnswer: (interaction, questionIndex, value) => {
      const current = responseFor(interaction);
      if (current.kind !== "question") {
        return;
      }
      setResponse(interaction.sessionId, interaction.id, {
        ...current,
        customAnswers: current.customAnswers.map((answer, index) =>
          index === questionIndex ? value : answer
        ),
      });
    },
    state$,
  };
}
