import type {
  PermissionRequest,
  QuestionRequest,
} from "@vibepad/protocol/interactions";
import { describe, expect, it } from "vitest";

import { createInteractionResponseStore } from "./interaction-response-store";

const permission: PermissionRequest = {
  action: "Run the formatter",
  id: "permission-1",
  kind: "permission",
  native: {},
  resources: ["repo"],
  save: [],
  sessionId: "session-a",
};

const question: QuestionRequest = {
  id: "question-1",
  kind: "question",
  native: {},
  questions: [
    {
      custom: true,
      header: "Scope",
      multiple: true,
      options: [
        { description: "Current package", label: "Package" },
        { description: "Whole workspace", label: "Workspace" },
      ],
      question: "Where should the change apply?",
    },
  ],
  sessionId: "session-a",
};

describe("Legend interaction response store", () => {
  it("updates one interaction while unrelated response leaves stay silent", () => {
    const store = createInteractionResponseStore();
    store.reconcileSession("session-a", [permission, question]);
    const permission$ = store.state$.bySessionId["session-a"]?.[permission.id];
    const question$ = store.state$.bySessionId["session-a"]?.[question.id];
    if (!(permission$ && question$)) {
      throw new Error("Legend did not create interaction response keys");
    }
    let permissionNotifications = 0;
    let questionNotifications = 0;
    const disposePermission = permission$.onChange(() => {
      permissionNotifications += 1;
    });
    const disposeQuestion = question$.onChange(() => {
      questionNotifications += 1;
    });

    store.selectQuestionOption(question, 0, "Package", true);

    expect(store.read("session-a", question.id)).toMatchObject({
      answers: [["Package"]],
    });
    expect(questionNotifications).toBe(1);
    expect(permissionNotifications).toBe(0);
    disposePermission();
    disposeQuestion();
  });

  it("retains partial answers across reconciliation and clears resolved work", () => {
    const store = createInteractionResponseStore();
    store.reconcileSession("session-a", [question]);
    store.selectQuestionOption(question, 0, "Package", true);
    store.setCustomAnswer(question, 0, "Include docs");

    store.reconcileSession("session-a", [{ ...question }]);

    expect(store.read("session-a", question.id)).toMatchObject({
      answers: [["Package"]],
      customAnswers: ["Include docs"],
      resolving: false,
    });
    expect(store.beginResolve(question)).toBe(true);
    expect(store.beginResolve(question)).toBe(false);
    store.failResolve(question, "Host disconnected");
    expect(store.read("session-a", question.id)).toMatchObject({
      answers: [["Package"]],
      customAnswers: ["Include docs"],
      errorMessage: "Host disconnected",
      resolving: false,
    });

    expect(store.beginResolve(question)).toBe(true);
    store.completeResolve(question);
    expect(store.read("session-a", question.id)).toBeUndefined();
  });
});
