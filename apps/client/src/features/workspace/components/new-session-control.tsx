import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import type { TriggerRef } from "@rn-primitives/popover";
import type { HarnessId } from "@vibepad/protocol/provider";
import { useCallback, useMemo, useRef } from "react";
import { Platform, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ObservableSearchField } from "@/components/ui/observable-search-field";
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
import { boundedListHeight } from "@/lib/virtualized-list-layout";

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
const projectItemSize = () => 56;

interface NewSessionControlState {
  creatingProjectId: string | undefined;
  errorMessage: string | undefined;
  query: string;
}

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

function NewSessionError({
  state$,
}: {
  readonly state$: Observable<NewSessionControlState>;
}) {
  const errorMessage = useValue(state$.errorMessage);
  return errorMessage ? (
    <Text className="px-1 text-red-600 text-xs">{errorMessage}</Text>
  ) : null;
}

function NewSessionProjectResults({
  onCreate,
  projects,
  selectedProjectId,
  state$,
}: {
  readonly onCreate: (projectId: string) => Promise<void>;
  readonly projects: readonly NewSessionProject[];
  readonly selectedProjectId: string | undefined;
  readonly state$: Observable<NewSessionControlState>;
}) {
  const query = useValue(state$.query);
  const creatingProjectId = useValue(state$.creatingProjectId);
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

  const renderProject = useCallback(
    ({ item }: LegendListRenderItemProps<NewSessionProject>) => (
      <ProjectOption
        creating={creatingProjectId === item.id}
        disabled={Boolean(creatingProjectId)}
        onCreate={onCreate}
        project={item}
        selected={item.id === selectedProjectId}
      />
    ),
    [creatingProjectId, onCreate, selectedProjectId]
  );
  const emptyProjects = useMemo(
    () => (
      <Text className="px-3 py-6 text-center text-xs" variant="muted">
        No matching workspaces.
      </Text>
    ),
    []
  );
  const listHeight = boundedListHeight({
    emptyHeight: 56,
    gap: 4,
    itemSize: projectItemSize,
    items: visibleProjects,
    maxHeight: 320,
  });

  return (
    <View
      pointerEvents={creatingProjectId ? "none" : "auto"}
      style={{ height: listHeight }}
      testID="new-session-project-list"
    >
      <LegendList
        contentContainerStyle={{ gap: 4 }}
        data={visibleProjects}
        dataKey="new-session-projects"
        extraData={`${creatingProjectId ?? "idle"}:${selectedProjectId ?? "none"}`}
        getFixedItemSize={projectItemSize}
        keyExtractor={projectKey}
        ListEmptyComponent={emptyProjects}
        recycleItems
        renderItem={renderProject}
        style={{ flex: 1 }}
        {...(Platform.OS === "web"
          ? {}
          : { keyboardShouldPersistTaps: "handled" as const })}
      />
    </View>
  );
}

export function NewSessionControl({
  disabled,
  onCreate,
  projects,
  selectedProjectId,
}: NewSessionControlProps) {
  const triggerRef = useRef<TriggerRef>(null);
  const state$ = useObservable<NewSessionControlState>({
    creatingProjectId: undefined,
    errorMessage: undefined,
    query: "",
  });
  const createSession = useCallback(
    async (projectId: string) => {
      if (state$.creatingProjectId.peek()) {
        return;
      }
      state$.assign({ creatingProjectId: projectId, errorMessage: undefined });
      try {
        await onCreate(projectId);
        triggerRef.current?.close();
      } catch (error) {
        state$.errorMessage.set(
          error instanceof Error ? error.message : "Unable to create session"
        );
      } finally {
        state$.creatingProjectId.set(undefined);
      }
    },
    [onCreate, state$]
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
        <ObservableSearchField
          placeholder="Search workspaces and harnesses…"
          query$={state$.query}
          testID="new-session-search"
        />
        <NewSessionProjectResults
          onCreate={createSession}
          projects={projects}
          selectedProjectId={selectedProjectId}
          state$={state$}
        />
        <NewSessionError state$={state$} />
      </PopoverContent>
    </Popover>
  );
}
