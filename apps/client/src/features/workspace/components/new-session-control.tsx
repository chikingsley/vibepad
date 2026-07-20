import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { TriggerRef } from "@rn-primitives/popover";
import type { HarnessId } from "@vibepad/protocol/provider";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useRef, useState } from "react";
import { Platform, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Text } from "@/components/ui/text";
import {
  HarnessIcon,
  harnessLabel,
} from "@/features/harness/components/harness-icon";
import { THEME } from "@/lib/theme";

export interface NewSessionProject {
  readonly harnessId: HarnessId;
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

interface NewSessionControlProps {
  readonly disabled: boolean;
  readonly onCreate: (projectId: string) => Promise<void>;
  readonly projects: readonly NewSessionProject[];
  readonly selectedProjectId: string | undefined;
}

const projectKey = (project: NewSessionProject) => project.id;

function ProjectOption({
  creating,
  disabled,
  onCreate,
  project,
  selected,
}: {
  readonly creating: boolean;
  readonly disabled: boolean;
  readonly onCreate: (projectId: string) => Promise<void>;
  readonly project: NewSessionProject;
  readonly selected: boolean;
}) {
  const create = useCallback(() => {
    onCreate(project.id).catch(() => undefined);
  }, [onCreate, project.id]);

  return (
    <Button
      accessibilityLabel={`Create ${harnessLabel(project.harnessId)} session in ${project.name}`}
      className="h-auto min-h-14 items-start justify-start px-3 py-2.5"
      disabled={disabled}
      onPress={create}
      testID={`new-session-project-${project.id}`}
      variant="ghost"
    >
      <HarnessIcon
        accessibilityLabel={harnessLabel(project.harnessId)}
        className="mt-0.5 text-muted-foreground"
        harnessId={project.harnessId}
        size={15}
      />
      <View className="min-w-0 flex-1 items-start gap-0.5">
        <View className="w-full flex-row items-center gap-2">
          <Text
            className="min-w-0 flex-1 font-medium text-sm"
            numberOfLines={1}
          >
            {project.name}
          </Text>
          {selected ? (
            <Text className="text-[10px]" variant="muted">
              Current
            </Text>
          ) : null}
        </View>
        <Text className="text-[10px]" numberOfLines={1} variant="muted">
          {creating
            ? "Creating…"
            : `${harnessLabel(project.harnessId)} · ${project.path}`}
        </Text>
      </View>
    </Button>
  );
}

export function NewSessionControl({
  disabled,
  onCreate,
  projects,
  selectedProjectId,
}: NewSessionControlProps) {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const triggerRef = useRef<TriggerRef>(null);
  const [creatingProjectId, setCreatingProjectId] = useState<
    string | undefined
  >();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId
  );
  const visibleProjects = useMemo(() => {
    const orderedProjects = selectedProject
      ? [
          selectedProject,
          ...projects.filter((project) => project.id !== selectedProject.id),
        ]
      : projects;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return orderedProjects;
    }
    return orderedProjects.filter((project) =>
      `${harnessLabel(project.harnessId)} ${project.name} ${project.path}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    );
  }, [projects, query, selectedProject]);

  const createSession = useCallback(
    async (projectId: string) => {
      if (creatingProjectId) {
        return;
      }
      setCreatingProjectId(projectId);
      setErrorMessage(undefined);
      try {
        await onCreate(projectId);
        triggerRef.current?.close();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to create session"
        );
      } finally {
        setCreatingProjectId(undefined);
      }
    },
    [creatingProjectId, onCreate]
  );
  const renderProject = useCallback(
    ({ item }: LegendListRenderItemProps<NewSessionProject>) => (
      <ProjectOption
        creating={creatingProjectId === item.id}
        disabled={Boolean(creatingProjectId)}
        onCreate={createSession}
        project={item}
        selected={item.id === selectedProjectId}
      />
    ),
    [createSession, creatingProjectId, selectedProjectId]
  );
  const emptyProjects = useMemo(
    () => (
      <Text className="px-3 py-6 text-center text-xs" variant="muted">
        No matching workspaces.
      </Text>
    ),
    []
  );

  return (
    <Popover>
      <PopoverTrigger asChild ref={triggerRef}>
        <Button
          accessibilityLabel="New session"
          className="h-10 shrink-0 rounded-lg bg-foreground px-3 shadow-black/10 shadow-sm sm:h-10"
          disabled={disabled}
          size="sm"
          testID="new-session-trigger"
        >
          <Icon className="text-background" name="plus" size={14} />
          <Text className="font-medium text-background text-xs">
            New session
          </Text>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 gap-3 rounded-xl p-3"
        side="bottom"
        sideOffset={6}
        testID="new-session-menu"
      >
        <View className="gap-1 px-1">
          <Text className="font-semibold text-sm">New session</Text>
          <Text className="text-[11px]" variant="muted">
            Choose the workspace and harness for this session.
          </Text>
        </View>
        <View className="flex-row items-center gap-2 rounded-lg border border-border px-3">
          <Icon className="text-muted-foreground" name="search" size={13} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            className="h-10 min-w-0 flex-1 text-foreground text-sm outline-none"
            onChangeText={setQuery}
            placeholder="Search workspaces and harnesses…"
            placeholderTextColor={theme.mutedForeground}
            style={{ color: theme.foreground }}
            testID="new-session-search"
            value={query}
          />
        </View>
        <LegendList
          contentContainerStyle={{ gap: 4 }}
          data={visibleProjects}
          dataKey={`new-session-projects:${query.trim().toLocaleLowerCase()}`}
          estimatedItemSize={56}
          extraData={`${creatingProjectId ?? "idle"}:${selectedProjectId ?? "none"}`}
          keyExtractor={projectKey}
          ListEmptyComponent={emptyProjects}
          recycleItems
          renderItem={renderProject}
          style={{ maxHeight: 320 }}
          testID="new-session-project-list"
          {...(Platform.OS === "web"
            ? {}
            : { keyboardShouldPersistTaps: "handled" as const })}
        />
        {errorMessage ? (
          <Text className="px-1 text-red-600 text-xs">{errorMessage}</Text>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
