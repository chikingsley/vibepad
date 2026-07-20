import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { $TextInput } from "@legendapp/state/react-native";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export interface SessionActionState {
  archiving: boolean;
  draft: string;
  errorMessage: string | undefined;
  renaming: boolean;
  saving: boolean;
}

function SessionActionError({
  className,
  state$,
}: {
  readonly className?: string;
  readonly state$: Observable<SessionActionState>;
}) {
  const errorMessage = useValue(state$.errorMessage);
  return errorMessage ? (
    <Text className={className ?? "text-red-600 text-xs"}>{errorMessage}</Text>
  ) : null;
}

function RenameTitleInput({
  onClear,
  onSave,
  state$,
  testIdPrefix,
}: {
  readonly onClear: () => void;
  readonly onSave: () => void;
  readonly state$: Observable<SessionActionState>;
  readonly testIdPrefix: string;
}) {
  const draft = useValue(state$.draft);
  const saving = useValue(state$.saving);

  return (
    <View className="flex-row items-center rounded-lg border border-border bg-card">
      <$TextInput
        $value={state$.draft}
        accessibilityLabel="Session title"
        autoFocus
        className="h-10 flex-1 px-3 text-foreground text-sm outline-none"
        editable={!saving}
        onSubmitEditing={onSave}
        returnKeyType="done"
        selectTextOnFocus
        testID={`${testIdPrefix}-title-input`}
      />
      <Button
        accessibilityLabel="Clear session title"
        className="mr-1 size-7 rounded-md"
        disabled={saving || draft.length === 0}
        onPress={onClear}
        size="icon"
        testID={`${testIdPrefix}-title-clear`}
        variant="ghost"
      >
        <Icon className="text-muted-foreground" name="x" size={13} />
      </Button>
    </View>
  );
}

function RenameActions({
  onCancel,
  onSave,
  state$,
  testIdPrefix,
}: {
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly state$: Observable<SessionActionState>;
  readonly testIdPrefix: string;
}) {
  const draft = useValue(state$.draft);
  const saving = useValue(state$.saving);

  return (
    <View className="flex-row justify-end gap-2">
      <Button
        disabled={saving}
        onPress={onCancel}
        size="sm"
        testID={`${testIdPrefix}-rename-cancel`}
        variant="ghost"
      >
        <Text>Cancel</Text>
      </Button>
      <Button
        disabled={saving || draft.trim().length === 0}
        onPress={onSave}
        size="sm"
        testID={`${testIdPrefix}-rename-save`}
      >
        <Text>{saving ? "Saving…" : "Save"}</Text>
      </Button>
    </View>
  );
}

export function RenameSessionForm({
  onCancel,
  onClear,
  onSave,
  state$,
  testIdPrefix,
}: {
  readonly onCancel: () => void;
  readonly onClear: () => void;
  readonly onSave: () => void;
  readonly state$: Observable<SessionActionState>;
  readonly testIdPrefix: string;
}) {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="font-semibold text-sm">Rename session</Text>
        <Text className="text-[11px]" variant="muted">
          This changes the durable harness session title.
        </Text>
      </View>
      <RenameTitleInput
        onClear={onClear}
        onSave={onSave}
        state$={state$}
        testIdPrefix={testIdPrefix}
      />
      <SessionActionError state$={state$} />
      <RenameActions
        onCancel={onCancel}
        onSave={onSave}
        state$={state$}
        testIdPrefix={testIdPrefix}
      />
    </View>
  );
}

export function SessionActionList({
  onArchive,
  onRename,
  state$,
  testIdPrefix,
  title,
}: {
  readonly onArchive: () => void;
  readonly onRename: () => void;
  readonly state$: Observable<SessionActionState>;
  readonly testIdPrefix: string;
  readonly title: string;
}) {
  const archiving = useValue(state$.archiving);

  return (
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
        onPress={onRename}
        testID={`${testIdPrefix}-rename`}
        variant="ghost"
      >
        <Text>Rename</Text>
      </Button>
      <Button
        className="justify-start gap-2"
        disabled={archiving}
        onPress={onArchive}
        testID={`${testIdPrefix}-archive`}
        variant="ghost"
      >
        <Icon className="text-muted-foreground" name="archive" size={14} />
        <Text>{archiving ? "Archiving…" : "Archive"}</Text>
      </Button>
      <SessionActionError
        className="px-2 text-red-600 text-xs"
        state$={state$}
      />
    </View>
  );
}
