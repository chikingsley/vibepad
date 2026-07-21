import { useObservable, useValue } from "@legendapp/state/react";
import type { TriggerRef } from "@rn-primitives/popover";
import { type RefObject, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  RenameSessionForm,
  SessionActionList,
  type SessionActionState,
} from "@/features/workspace/components/session-actions-menu-content";

interface SessionActionsMenuProps {
  readonly onArchive: () => Promise<void>;
  readonly onRename: (title: string) => Promise<void>;
  readonly selected: boolean;
  readonly sessionId: string;
  readonly title: string;
  readonly triggerRef: RefObject<TriggerRef | null>;
}

export function SessionActionsMenu({
  onArchive,
  onRename,
  selected,
  sessionId,
  title,
  triggerRef,
}: SessionActionsMenuProps) {
  const state$ = useObservable<SessionActionState>({
    archiving: false,
    draft: "",
    errorMessage: undefined,
    renaming: false,
    saving: false,
  });
  const renaming = useValue(state$.renaming);
  const testIdPrefix = selected ? "selected-session" : `session-${sessionId}`;

  const reset = useCallback(() => {
    state$.assign({ draft: "", errorMessage: undefined, renaming: false });
  }, [state$]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        reset();
      }
    },
    [reset]
  );

  const beginRename = useCallback(() => {
    state$.assign({ draft: title, errorMessage: undefined, renaming: true });
  }, [state$, title]);

  const clearDraft = useCallback(() => {
    state$.draft.set("");
  }, [state$]);

  const cancelRename = useCallback(() => {
    reset();
    triggerRef.current?.close();
  }, [reset, triggerRef]);

  const saveRename = useCallback(async () => {
    const nextTitle = state$.draft.peek().trim();
    if (!nextTitle || state$.saving.peek()) {
      return;
    }
    if (nextTitle === title) {
      cancelRename();
      return;
    }

    state$.assign({ errorMessage: undefined, saving: true });
    try {
      await onRename(nextTitle);
      reset();
      triggerRef.current?.close();
    } catch (error) {
      state$.errorMessage.set(
        error instanceof Error ? error.message : "Unable to rename session"
      );
    } finally {
      state$.saving.set(false);
    }
  }, [cancelRename, onRename, reset, state$, title, triggerRef]);

  const archive = useCallback(async () => {
    if (state$.archiving.peek()) {
      return;
    }
    state$.assign({ archiving: true, errorMessage: undefined });
    try {
      await onArchive();
      triggerRef.current?.close();
    } catch (error) {
      state$.errorMessage.set(
        error instanceof Error ? error.message : "Unable to archive session"
      );
    } finally {
      state$.archiving.set(false);
    }
  }, [onArchive, state$, triggerRef]);

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild ref={triggerRef}>
        <Button
          accessibilityLabel={`Session actions for ${title}`}
          className="size-11 rounded-md sm:size-11"
          size="icon"
          testID={`${testIdPrefix}-actions-trigger`}
          variant="ghost"
        >
          <Icon className="text-muted-foreground" name="ellipsis" size={15} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 gap-3 rounded-xl p-3"
        side="bottom"
        sideOffset={6}
        testID={`${testIdPrefix}-actions-menu`}
      >
        {renaming ? (
          <RenameSessionForm
            onCancel={cancelRename}
            onClear={clearDraft}
            onSave={saveRename}
            state$={state$}
            testIdPrefix={testIdPrefix}
          />
        ) : (
          <SessionActionList
            onArchive={archive}
            onRename={beginRename}
            state$={state$}
            testIdPrefix={testIdPrefix}
            title={title}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
