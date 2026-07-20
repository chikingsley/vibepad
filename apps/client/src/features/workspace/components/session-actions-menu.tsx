import type { TriggerRef } from "@rn-primitives/popover";
import { type RefObject, useCallback, useState } from "react";
import { TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Text } from "@/components/ui/text";

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
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const testIdPrefix = selected ? "selected-session" : `session-${sessionId}`;

  const reset = useCallback(() => {
    setRenaming(false);
    setDraft("");
    setErrorMessage(undefined);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        reset();
      }
    },
    [reset]
  );

  const beginRename = useCallback(() => {
    setDraft(title);
    setErrorMessage(undefined);
    setRenaming(true);
  }, [title]);

  const handleDraftChange = useCallback((nextDraft: string) => {
    setDraft(nextDraft);
  }, []);

  const clearDraft = useCallback(() => {
    setDraft("");
  }, []);

  const cancelRename = useCallback(() => {
    reset();
    triggerRef.current?.close();
  }, [reset, triggerRef]);

  const saveRename = useCallback(async () => {
    const nextTitle = draft.trim();
    if (!nextTitle || saving) {
      return;
    }
    if (nextTitle === title) {
      cancelRename();
      return;
    }

    setSaving(true);
    setErrorMessage(undefined);
    try {
      await onRename(nextTitle);
      reset();
      triggerRef.current?.close();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to rename session"
      );
    } finally {
      setSaving(false);
    }
  }, [cancelRename, draft, onRename, reset, saving, title, triggerRef]);

  const archive = useCallback(async () => {
    if (archiving) {
      return;
    }
    setArchiving(true);
    setErrorMessage(undefined);
    try {
      await onArchive();
      triggerRef.current?.close();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to archive session"
      );
    } finally {
      setArchiving(false);
    }
  }, [archiving, onArchive, triggerRef]);

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild ref={triggerRef}>
        <Button
          accessibilityLabel={`Session actions for ${title}`}
          className="size-7 rounded-md"
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
          <View className="gap-3">
            <View className="gap-1">
              <Text className="font-semibold text-sm">Rename session</Text>
              <Text className="text-[11px]" variant="muted">
                This changes the durable harness session title.
              </Text>
            </View>
            <View className="flex-row items-center rounded-lg border border-border bg-card">
              <TextInput
                accessibilityLabel="Session title"
                autoFocus
                className="h-10 flex-1 px-3 text-foreground text-sm outline-none"
                editable={!saving}
                onChangeText={handleDraftChange}
                onSubmitEditing={saveRename}
                returnKeyType="done"
                selectTextOnFocus
                testID={`${testIdPrefix}-title-input`}
                value={draft}
              />
              <Button
                accessibilityLabel="Clear session title"
                className="mr-1 size-7 rounded-md"
                disabled={saving || draft.length === 0}
                onPress={clearDraft}
                size="icon"
                testID={`${testIdPrefix}-title-clear`}
                variant="ghost"
              >
                <Icon className="text-muted-foreground" name="x" size={13} />
              </Button>
            </View>
            {errorMessage ? (
              <Text className="text-red-600 text-xs">{errorMessage}</Text>
            ) : null}
            <View className="flex-row justify-end gap-2">
              <Button
                disabled={saving}
                onPress={cancelRename}
                size="sm"
                testID={`${testIdPrefix}-rename-cancel`}
                variant="ghost"
              >
                <Text>Cancel</Text>
              </Button>
              <Button
                disabled={saving || draft.trim().length === 0}
                onPress={saveRename}
                size="sm"
                testID={`${testIdPrefix}-rename-save`}
              >
                <Text>{saving ? "Saving…" : "Save"}</Text>
              </Button>
            </View>
          </View>
        ) : (
          <View className="gap-1">
            <View className="px-2 pt-1 pb-2">
              <Text className="font-medium text-xs" numberOfLines={1}>
                {title}
              </Text>
              <Text className="text-[10px]" variant="muted">
                Session actions
              </Text>
            </View>
            <Button
              className="justify-start"
              onPress={beginRename}
              testID={`${testIdPrefix}-rename`}
              variant="ghost"
            >
              <Text>Rename</Text>
            </Button>
            <Button
              className="justify-start gap-2"
              disabled={archiving}
              onPress={archive}
              testID={`${testIdPrefix}-archive`}
              variant="ghost"
            >
              <Icon
                className="text-muted-foreground"
                name="archive"
                size={14}
              />
              <Text>{archiving ? "Archiving…" : "Archive"}</Text>
            </Button>
            {errorMessage ? (
              <Text className="px-2 text-red-600 text-xs">{errorMessage}</Text>
            ) : null}
          </View>
        )}
      </PopoverContent>
    </Popover>
  );
}
